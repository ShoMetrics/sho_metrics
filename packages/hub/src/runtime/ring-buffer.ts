/**
 * Fixed-length circular buffer maintaining a sliding window of values.
 * Used to store the latest N metric samples for sparkline rendering.
 */
export class RingBuffer<T> {
    private readonly buffer: (T | undefined)[];
    private head = 0;
    private count = 0;

    constructor(readonly capacity: number) {
        this.buffer = Array<T | undefined>(capacity);
    }

    push(value: T): void {
        this.buffer[this.head] = value;
        this.head = (this.head + 1) % this.capacity;
        if (this.count < this.capacity) {
            this.count++;
        }
    }

    toArray(): T[] {
        if (this.count === 0) return [];
        const result = Array<T>(this.count);
        const start = (this.head - this.count + this.capacity) % this.capacity;
        for (let index = 0; index < this.count; index++) {
            result[index] = this.buffer[(start + index) % this.capacity] as T;
        }
        return result;
    }

    get length(): number {
        return this.count;
    }

    get latest(): T | undefined {
        if (this.count === 0) return undefined;
        return this.buffer[(this.head - 1 + this.capacity) % this.capacity];
    }
}
