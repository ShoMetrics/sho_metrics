import * as $protobuf from "protobufjs";
import Long = require("long");
/** Namespace shometrics. */
export namespace shometrics {

    /** Namespace v1. */
    namespace v1 {

        /** Properties of a MetricSnapshot. */
        interface IMetricSnapshot {

            /** MetricSnapshot sourceId */
            sourceId?: (string|null);

            /** MetricSnapshot timestampMs */
            timestampMs?: (number|Long|null);

            /** MetricSnapshot metrics */
            metrics?: ({ [k: string]: shometrics.v1.IMetricValue }|null);
        }

        /** Represents a MetricSnapshot. */
        class MetricSnapshot implements IMetricSnapshot {

            /**
             * Constructs a new MetricSnapshot.
             * @param [properties] Properties to set
             */
            constructor(properties?: shometrics.v1.IMetricSnapshot);

            /** MetricSnapshot sourceId. */
            public sourceId: string;

            /** MetricSnapshot timestampMs. */
            public timestampMs: (number|Long);

            /** MetricSnapshot metrics. */
            public metrics: { [k: string]: shometrics.v1.IMetricValue };

            /**
             * Creates a new MetricSnapshot instance using the specified properties.
             * @param [properties] Properties to set
             * @returns MetricSnapshot instance
             */
            public static create(properties?: shometrics.v1.IMetricSnapshot): shometrics.v1.MetricSnapshot;

            /**
             * Encodes the specified MetricSnapshot message. Does not implicitly {@link shometrics.v1.MetricSnapshot.verify|verify} messages.
             * @param message MetricSnapshot message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encode(message: shometrics.v1.IMetricSnapshot, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Encodes the specified MetricSnapshot message, length delimited. Does not implicitly {@link shometrics.v1.MetricSnapshot.verify|verify} messages.
             * @param message MetricSnapshot message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encodeDelimited(message: shometrics.v1.IMetricSnapshot, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Decodes a MetricSnapshot message from the specified reader or buffer.
             * @param reader Reader or buffer to decode from
             * @param [length] Message length if known beforehand
             * @returns MetricSnapshot
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): shometrics.v1.MetricSnapshot;

            /**
             * Decodes a MetricSnapshot message from the specified reader or buffer, length delimited.
             * @param reader Reader or buffer to decode from
             * @returns MetricSnapshot
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): shometrics.v1.MetricSnapshot;

            /**
             * Verifies a MetricSnapshot message.
             * @param message Plain object to verify
             * @returns `null` if valid, otherwise the reason why it is not
             */
            public static verify(message: { [k: string]: any }): (string|null);

            /**
             * Creates a MetricSnapshot message from a plain object. Also converts values to their respective internal types.
             * @param object Plain object
             * @returns MetricSnapshot
             */
            public static fromObject(object: { [k: string]: any }): shometrics.v1.MetricSnapshot;

            /**
             * Creates a plain object from a MetricSnapshot message. Also converts values to other types if specified.
             * @param message MetricSnapshot
             * @param [options] Conversion options
             * @returns Plain object
             */
            public static toObject(message: shometrics.v1.MetricSnapshot, options?: $protobuf.IConversionOptions): { [k: string]: any };

            /**
             * Converts this MetricSnapshot to JSON.
             * @returns JSON object
             */
            public toJSON(): { [k: string]: any };

            /**
             * Gets the default type url for MetricSnapshot
             * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns The default type url
             */
            public static getTypeUrl(typeUrlPrefix?: string): string;
        }

        /** Properties of a MetricValue. */
        interface IMetricValue {

            /** MetricValue scalar */
            scalar?: (number|null);

            /** MetricValue text */
            text?: (string|null);

            /** MetricValue unit */
            unit?: (string|null);

            /** MetricValue progress */
            progress?: (number|null);
        }

        /** Represents a MetricValue. */
        class MetricValue implements IMetricValue {

            /**
             * Constructs a new MetricValue.
             * @param [properties] Properties to set
             */
            constructor(properties?: shometrics.v1.IMetricValue);

            /** MetricValue scalar. */
            public scalar?: (number|null);

            /** MetricValue text. */
            public text?: (string|null);

            /** MetricValue unit. */
            public unit: string;

            /** MetricValue progress. */
            public progress: number;

            /** MetricValue data. */
            public data?: ("scalar"|"text");

            /**
             * Creates a new MetricValue instance using the specified properties.
             * @param [properties] Properties to set
             * @returns MetricValue instance
             */
            public static create(properties?: shometrics.v1.IMetricValue): shometrics.v1.MetricValue;

            /**
             * Encodes the specified MetricValue message. Does not implicitly {@link shometrics.v1.MetricValue.verify|verify} messages.
             * @param message MetricValue message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encode(message: shometrics.v1.IMetricValue, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Encodes the specified MetricValue message, length delimited. Does not implicitly {@link shometrics.v1.MetricValue.verify|verify} messages.
             * @param message MetricValue message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encodeDelimited(message: shometrics.v1.IMetricValue, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Decodes a MetricValue message from the specified reader or buffer.
             * @param reader Reader or buffer to decode from
             * @param [length] Message length if known beforehand
             * @returns MetricValue
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): shometrics.v1.MetricValue;

            /**
             * Decodes a MetricValue message from the specified reader or buffer, length delimited.
             * @param reader Reader or buffer to decode from
             * @returns MetricValue
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): shometrics.v1.MetricValue;

            /**
             * Verifies a MetricValue message.
             * @param message Plain object to verify
             * @returns `null` if valid, otherwise the reason why it is not
             */
            public static verify(message: { [k: string]: any }): (string|null);

            /**
             * Creates a MetricValue message from a plain object. Also converts values to their respective internal types.
             * @param object Plain object
             * @returns MetricValue
             */
            public static fromObject(object: { [k: string]: any }): shometrics.v1.MetricValue;

            /**
             * Creates a plain object from a MetricValue message. Also converts values to other types if specified.
             * @param message MetricValue
             * @param [options] Conversion options
             * @returns Plain object
             */
            public static toObject(message: shometrics.v1.MetricValue, options?: $protobuf.IConversionOptions): { [k: string]: any };

            /**
             * Converts this MetricValue to JSON.
             * @returns JSON object
             */
            public toJSON(): { [k: string]: any };

            /**
             * Gets the default type url for MetricValue
             * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns The default type url
             */
            public static getTypeUrl(typeUrlPrefix?: string): string;
        }
    }
}
