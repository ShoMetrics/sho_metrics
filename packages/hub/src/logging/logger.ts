import streamDeck from "@elgato/streamdeck";
import type { LogEntryData, LogLevel } from "@elgato/utils/logging";

/**
 * Log message input.
 *
 * Use a function whenever formatting is non-trivial. The function is evaluated
 * only after the current log level allows the message to be written.
 */
export type LogProvider = string | (() => string);

/**
 * Small named object contract used to support class/function scopes.
 *
 * Prefer explicit string scopes in production call sites because minification
 * can rename class and function names.
 */
type NamedContext = {
    readonly name: string;
};

/**
 * Minimal subset of the Elgato logger that ShoMetrics depends on.
 *
 * Keeping this as a structural type makes the wrapper testable without pulling
 * the whole Stream Deck SDK into tests.
 */
type LoggerSink = {
    readonly level: LogLevel;
    setLevel(level?: LogLevel): LoggerSink;
    createScope(scope: string): LoggerSink;
    error(...data: LogEntryData): LoggerSink;
    warn(...data: LogEntryData): LoggerSink;
    info(...data: LogEntryData): LoggerSink;
    debug(...data: LogEntryData): LoggerSink;
    trace(...data: LogEntryData): LoggerSink;
};

/**
 * Fluent builder for logs that need extra behavior, currently keyed throttling.
 */
export interface LogBuilder {
    /**
     * Rate-limits a log point by key.
     *
     * Limitation: the key is scoped to the current `ScopedLogger` instance, not
     * process-wide. Use a stable key that is unique within the scope.
     */
    everyMs(key: string, milliseconds: number): LogBuilder;

    /**
     * Writes the message if the level is enabled and all builder constraints pass.
     */
    log(message: LogProvider): void;
}

/**
 * Logger bound to one logical component scope.
 */
export interface ScopedLogger {
    /**
     * Writes failures or exceptions that prevent the requested operation.
     */
    error(message: LogProvider): void;

    /**
     * Writes recoverable failures or degraded behavior.
     */
    warn(message: LogProvider): void;

    /**
     * Writes normal lifecycle events useful in production logs.
     */
    info(message: LogProvider): void;

    /**
     * Writes development/debug details.
     */
    debug(message: LogProvider): void;

    /**
     * Writes high-volume diagnostic details.
     */
    trace(message: LogProvider): void;

    /**
     * Creates a fluent builder for an error-level log.
     */
    atError(): LogBuilder;

    /**
     * Creates a fluent builder for a warn-level log.
     */
    atWarn(): LogBuilder;

    /**
     * Creates a fluent builder for an info-level log.
     */
    atInfo(): LogBuilder;

    /**
     * Creates a fluent builder for a debug-level log.
     */
    atDebug(): LogBuilder;

    /**
     * Creates a fluent builder for a trace-level log.
     */
    atTrace(): LogBuilder;
}

/**
 * Project logger entry point.
 *
 * Business code should create scoped instances via `for()` and should not call
 * the Stream Deck SDK logger directly.
 */
export interface ShoLogger {
    /**
     * Sets the global minimum log level used by the underlying Stream Deck logger.
     */
    setLevel(level?: LogLevel): void;

    /**
     * Creates a logger with a mandatory component scope.
     *
     * Limitation: when a class/function/object is passed, the scope is derived
     * from `.name` or `constructor.name`; those names may change in minified
     * production builds. Prefer explicit strings for stable scopes.
     */
    for(context: string | NamedContext | object): ScopedLogger;

    /**
     * Creates a logger with the explicit `Unscoped` scope.
     *
     * @deprecated Temporary local debugging escape hatch only. Do not check in
     * code that uses this method; create a proper `logger.for("Scope")` instead.
     */
    unscoped(): ScopedLogger;
}

/**
 * Shared no-op builder returned when a level is disabled.
 */
class NoOpLogBuilder implements LogBuilder {
    public everyMs(): LogBuilder {
        return this;
    }

    public log(): void {
        return;
    }
}

/**
 * Mutable fluent builder used only when the requested level is enabled.
 */
class ScopedLogBuilder implements LogBuilder {
    private throttleKey: string | null = null;
    private throttleMilliseconds = 0;

    public constructor(
        private readonly scopedLogger: ScopedLoggerImpl,
        private readonly level: LogLevel,
    ) {}

    public everyMs(key: string, milliseconds: number): LogBuilder {
        this.throttleKey = key;
        this.throttleMilliseconds = milliseconds;
        return this;
    }

    public log(message: LogProvider): void {
        if (
            this.throttleKey
            && !this.scopedLogger.shouldWriteThrottled(this.throttleKey, this.throttleMilliseconds)
        ) {
            return;
        }

        this.scopedLogger.write(this.level, message);
    }
}

/**
 * Scope-bound logger implementation with level checks before lazy formatting.
 */
class ScopedLoggerImpl implements ScopedLogger {
    private readonly lastWriteTimestampByKey = new Map<string, number>();

    public constructor(
        private readonly sink: LoggerSink,
        private readonly isLevelEnabled: (level: LogLevel) => boolean,
    ) {}

    public error(message: LogProvider): void {
        this.write("error", message);
    }

    public warn(message: LogProvider): void {
        this.write("warn", message);
    }

    public info(message: LogProvider): void {
        this.write("info", message);
    }

    public debug(message: LogProvider): void {
        this.write("debug", message);
    }

    public trace(message: LogProvider): void {
        this.write("trace", message);
    }

    public atError(): LogBuilder {
        return this.createBuilder("error");
    }

    public atWarn(): LogBuilder {
        return this.createBuilder("warn");
    }

    public atInfo(): LogBuilder {
        return this.createBuilder("info");
    }

    public atDebug(): LogBuilder {
        return this.createBuilder("debug");
    }

    public atTrace(): LogBuilder {
        return this.createBuilder("trace");
    }

    /**
     * Records and checks keyed throttling for this scoped logger instance.
     */
    public shouldWriteThrottled(key: string, milliseconds: number): boolean {
        const currentTimestampMilliseconds = Date.now();
        const lastWriteTimestampMilliseconds = this.lastWriteTimestampByKey.get(key);

        if (
            lastWriteTimestampMilliseconds != null
            && currentTimestampMilliseconds - lastWriteTimestampMilliseconds < milliseconds
        ) {
            return false;
        }

        this.lastWriteTimestampByKey.set(key, currentTimestampMilliseconds);
        return true;
    }

    /**
     * Writes one message after the global log level check.
     */
    public write(level: LogLevel, message: LogProvider): void {
        if (!this.isLevelEnabled(level)) {
            return;
        }

        this.sink[level](typeof message === "function" ? message() : message);
    }

    private createBuilder(level: LogLevel): LogBuilder {
        if (!this.isLevelEnabled(level)) {
            return NO_OP_BUILDER;
        }

        return new ScopedLogBuilder(this, level);
    }
}

/**
 * Global logger factory backed by the Stream Deck SDK logger.
 */
class ShoLoggerImpl implements ShoLogger {
    public constructor(private readonly sink: LoggerSink) {}

    public setLevel(level?: LogLevel): void {
        this.sink.setLevel(level);
    }

    public for(context: string | NamedContext | object): ScopedLogger {
        const scope = resolveScope(context);
        return new ScopedLoggerImpl(this.sink.createScope(scope), level => this.isLevelEnabled(level));
    }

    public unscoped(): ScopedLogger {
        return new ScopedLoggerImpl(this.sink.createScope("Unscoped"), level => this.isLevelEnabled(level));
    }

    private isLevelEnabled(level: LogLevel): boolean {
        return getLogLevelPriority(level) <= getLogLevelPriority(this.sink.level);
    }
}

const NO_OP_BUILDER = new NoOpLogBuilder();

/**
 * Resolves user-provided context into a stable Stream Deck logger scope.
 */
function resolveScope(context: string | NamedContext | object): string {
    if (typeof context === "string") {
        return context.trim() || "Unscoped";
    }

    if (hasName(context)) {
        return context.name.trim() || "Unscoped";
    }

    const constructorName = context.constructor?.name;
    return constructorName && constructorName !== "Object" ? constructorName : "Unscoped";
}

/**
 * Checks whether an arbitrary object can provide a readable `.name` scope.
 */
function hasName(value: object): value is NamedContext {
    return "name" in value && typeof value.name === "string";
}

/**
 * Converts Stream Deck log levels into ordered priorities.
 */
function getLogLevelPriority(level: LogLevel): number {
    switch (level) {
        case "error":
            return 0;
        case "warn":
            return 1;
        case "info":
            return 2;
        case "debug":
            return 3;
        case "trace":
        default:
            return 4;
    }
}

export const logger: ShoLogger = new ShoLoggerImpl(streamDeck.logger);
