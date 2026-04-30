/*eslint-disable block-scoped-var, id-length, no-control-regex, no-magic-numbers, no-prototype-builtins, no-redeclare, no-shadow, no-var, sort-vars*/
import * as $protobuf from "protobufjs/minimal";

// Common aliases
const $Reader = $protobuf.Reader, $Writer = $protobuf.Writer, $util = $protobuf.util;

// Exported root namespace
const $root = $protobuf.roots["default"] || ($protobuf.roots["default"] = {});

export const shometrics = $root.shometrics = (() => {

    /**
     * Namespace shometrics.
     * @exports shometrics
     * @namespace
     */
    const shometrics = {};

    shometrics.v1 = (function() {

        /**
         * Namespace v1.
         * @memberof shometrics
         * @namespace
         */
        const v1 = {};

        v1.MetricSnapshot = (function() {

            /**
             * Properties of a MetricSnapshot.
             * @memberof shometrics.v1
             * @interface IMetricSnapshot
             * @property {string|null} [sourceId] MetricSnapshot sourceId
             * @property {number|Long|null} [timestampMs] MetricSnapshot timestampMs
             * @property {Object.<string,shometrics.v1.IMetricValue>|null} [metrics] MetricSnapshot metrics
             */

            /**
             * Constructs a new MetricSnapshot.
             * @memberof shometrics.v1
             * @classdesc Represents a MetricSnapshot.
             * @implements IMetricSnapshot
             * @constructor
             * @param {shometrics.v1.IMetricSnapshot=} [properties] Properties to set
             */
            function MetricSnapshot(properties) {
                this.metrics = {};
                if (properties)
                    for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null)
                            this[keys[i]] = properties[keys[i]];
            }

            /**
             * MetricSnapshot sourceId.
             * @member {string} sourceId
             * @memberof shometrics.v1.MetricSnapshot
             * @instance
             */
            MetricSnapshot.prototype.sourceId = "";

            /**
             * MetricSnapshot timestampMs.
             * @member {number|Long} timestampMs
             * @memberof shometrics.v1.MetricSnapshot
             * @instance
             */
            MetricSnapshot.prototype.timestampMs = $util.Long ? $util.Long.fromBits(0,0,true) : 0;

            /**
             * MetricSnapshot metrics.
             * @member {Object.<string,shometrics.v1.IMetricValue>} metrics
             * @memberof shometrics.v1.MetricSnapshot
             * @instance
             */
            MetricSnapshot.prototype.metrics = $util.emptyObject;

            /**
             * Creates a new MetricSnapshot instance using the specified properties.
             * @function create
             * @memberof shometrics.v1.MetricSnapshot
             * @static
             * @param {shometrics.v1.IMetricSnapshot=} [properties] Properties to set
             * @returns {shometrics.v1.MetricSnapshot} MetricSnapshot instance
             */
            MetricSnapshot.create = function create(properties) {
                return new MetricSnapshot(properties);
            };

            /**
             * Encodes the specified MetricSnapshot message. Does not implicitly {@link shometrics.v1.MetricSnapshot.verify|verify} messages.
             * @function encode
             * @memberof shometrics.v1.MetricSnapshot
             * @static
             * @param {shometrics.v1.IMetricSnapshot} message MetricSnapshot message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            MetricSnapshot.encode = function encode(message, writer) {
                if (!writer)
                    writer = $Writer.create();
                if (message.sourceId != null && Object.hasOwnProperty.call(message, "sourceId"))
                    writer.uint32(/* id 1, wireType 2 =*/10).string(message.sourceId);
                if (message.timestampMs != null && Object.hasOwnProperty.call(message, "timestampMs"))
                    writer.uint32(/* id 2, wireType 0 =*/16).uint64(message.timestampMs);
                if (message.metrics != null && Object.hasOwnProperty.call(message, "metrics"))
                    for (let keys = Object.keys(message.metrics), i = 0; i < keys.length; ++i) {
                        writer.uint32(/* id 3, wireType 2 =*/26).fork().uint32(/* id 1, wireType 2 =*/10).string(keys[i]);
                        $root.shometrics.v1.MetricValue.encode(message.metrics[keys[i]], writer.uint32(/* id 2, wireType 2 =*/18).fork()).ldelim().ldelim();
                    }
                return writer;
            };

            /**
             * Encodes the specified MetricSnapshot message, length delimited. Does not implicitly {@link shometrics.v1.MetricSnapshot.verify|verify} messages.
             * @function encodeDelimited
             * @memberof shometrics.v1.MetricSnapshot
             * @static
             * @param {shometrics.v1.IMetricSnapshot} message MetricSnapshot message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            MetricSnapshot.encodeDelimited = function encodeDelimited(message, writer) {
                return this.encode(message, writer).ldelim();
            };

            /**
             * Decodes a MetricSnapshot message from the specified reader or buffer.
             * @function decode
             * @memberof shometrics.v1.MetricSnapshot
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {shometrics.v1.MetricSnapshot} MetricSnapshot
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            MetricSnapshot.decode = function decode(reader, length, error) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                let end = length === undefined ? reader.len : reader.pos + length, message = new $root.shometrics.v1.MetricSnapshot(), key, value;
                while (reader.pos < end) {
                    let tag = reader.uint32();
                    if (tag === error)
                        break;
                    switch (tag >>> 3) {
                    case 1: {
                            message.sourceId = reader.string();
                            break;
                        }
                    case 2: {
                            message.timestampMs = reader.uint64();
                            break;
                        }
                    case 3: {
                            if (message.metrics === $util.emptyObject)
                                message.metrics = {};
                            let end2 = reader.uint32() + reader.pos;
                            key = "";
                            value = null;
                            while (reader.pos < end2) {
                                let tag2 = reader.uint32();
                                switch (tag2 >>> 3) {
                                case 1:
                                    key = reader.string();
                                    break;
                                case 2:
                                    value = $root.shometrics.v1.MetricValue.decode(reader, reader.uint32());
                                    break;
                                default:
                                    reader.skipType(tag2 & 7);
                                    break;
                                }
                            }
                            message.metrics[key] = value;
                            break;
                        }
                    default:
                        reader.skipType(tag & 7);
                        break;
                    }
                }
                return message;
            };

            /**
             * Decodes a MetricSnapshot message from the specified reader or buffer, length delimited.
             * @function decodeDelimited
             * @memberof shometrics.v1.MetricSnapshot
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @returns {shometrics.v1.MetricSnapshot} MetricSnapshot
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            MetricSnapshot.decodeDelimited = function decodeDelimited(reader) {
                if (!(reader instanceof $Reader))
                    reader = new $Reader(reader);
                return this.decode(reader, reader.uint32());
            };

            /**
             * Verifies a MetricSnapshot message.
             * @function verify
             * @memberof shometrics.v1.MetricSnapshot
             * @static
             * @param {Object.<string,*>} message Plain object to verify
             * @returns {string|null} `null` if valid, otherwise the reason why it is not
             */
            MetricSnapshot.verify = function verify(message) {
                if (typeof message !== "object" || message === null)
                    return "object expected";
                if (message.sourceId != null && message.hasOwnProperty("sourceId"))
                    if (!$util.isString(message.sourceId))
                        return "sourceId: string expected";
                if (message.timestampMs != null && message.hasOwnProperty("timestampMs"))
                    if (!$util.isInteger(message.timestampMs) && !(message.timestampMs && $util.isInteger(message.timestampMs.low) && $util.isInteger(message.timestampMs.high)))
                        return "timestampMs: integer|Long expected";
                if (message.metrics != null && message.hasOwnProperty("metrics")) {
                    if (!$util.isObject(message.metrics))
                        return "metrics: object expected";
                    let key = Object.keys(message.metrics);
                    for (let i = 0; i < key.length; ++i) {
                        let error = $root.shometrics.v1.MetricValue.verify(message.metrics[key[i]]);
                        if (error)
                            return "metrics." + error;
                    }
                }
                return null;
            };

            /**
             * Creates a MetricSnapshot message from a plain object. Also converts values to their respective internal types.
             * @function fromObject
             * @memberof shometrics.v1.MetricSnapshot
             * @static
             * @param {Object.<string,*>} object Plain object
             * @returns {shometrics.v1.MetricSnapshot} MetricSnapshot
             */
            MetricSnapshot.fromObject = function fromObject(object) {
                if (object instanceof $root.shometrics.v1.MetricSnapshot)
                    return object;
                let message = new $root.shometrics.v1.MetricSnapshot();
                if (object.sourceId != null)
                    message.sourceId = String(object.sourceId);
                if (object.timestampMs != null)
                    if ($util.Long)
                        (message.timestampMs = $util.Long.fromValue(object.timestampMs)).unsigned = true;
                    else if (typeof object.timestampMs === "string")
                        message.timestampMs = parseInt(object.timestampMs, 10);
                    else if (typeof object.timestampMs === "number")
                        message.timestampMs = object.timestampMs;
                    else if (typeof object.timestampMs === "object")
                        message.timestampMs = new $util.LongBits(object.timestampMs.low >>> 0, object.timestampMs.high >>> 0).toNumber(true);
                if (object.metrics) {
                    if (typeof object.metrics !== "object")
                        throw TypeError(".shometrics.v1.MetricSnapshot.metrics: object expected");
                    message.metrics = {};
                    for (let keys = Object.keys(object.metrics), i = 0; i < keys.length; ++i) {
                        if (typeof object.metrics[keys[i]] !== "object")
                            throw TypeError(".shometrics.v1.MetricSnapshot.metrics: object expected");
                        message.metrics[keys[i]] = $root.shometrics.v1.MetricValue.fromObject(object.metrics[keys[i]]);
                    }
                }
                return message;
            };

            /**
             * Creates a plain object from a MetricSnapshot message. Also converts values to other types if specified.
             * @function toObject
             * @memberof shometrics.v1.MetricSnapshot
             * @static
             * @param {shometrics.v1.MetricSnapshot} message MetricSnapshot
             * @param {$protobuf.IConversionOptions} [options] Conversion options
             * @returns {Object.<string,*>} Plain object
             */
            MetricSnapshot.toObject = function toObject(message, options) {
                if (!options)
                    options = {};
                let object = {};
                if (options.objects || options.defaults)
                    object.metrics = {};
                if (options.defaults) {
                    object.sourceId = "";
                    if ($util.Long) {
                        let long = new $util.Long(0, 0, true);
                        object.timestampMs = options.longs === String ? long.toString() : options.longs === Number ? long.toNumber() : long;
                    } else
                        object.timestampMs = options.longs === String ? "0" : 0;
                }
                if (message.sourceId != null && message.hasOwnProperty("sourceId"))
                    object.sourceId = message.sourceId;
                if (message.timestampMs != null && message.hasOwnProperty("timestampMs"))
                    if (typeof message.timestampMs === "number")
                        object.timestampMs = options.longs === String ? String(message.timestampMs) : message.timestampMs;
                    else
                        object.timestampMs = options.longs === String ? $util.Long.prototype.toString.call(message.timestampMs) : options.longs === Number ? new $util.LongBits(message.timestampMs.low >>> 0, message.timestampMs.high >>> 0).toNumber(true) : message.timestampMs;
                let keys2;
                if (message.metrics && (keys2 = Object.keys(message.metrics)).length) {
                    object.metrics = {};
                    for (let j = 0; j < keys2.length; ++j)
                        object.metrics[keys2[j]] = $root.shometrics.v1.MetricValue.toObject(message.metrics[keys2[j]], options);
                }
                return object;
            };

            /**
             * Converts this MetricSnapshot to JSON.
             * @function toJSON
             * @memberof shometrics.v1.MetricSnapshot
             * @instance
             * @returns {Object.<string,*>} JSON object
             */
            MetricSnapshot.prototype.toJSON = function toJSON() {
                return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
            };

            /**
             * Gets the default type url for MetricSnapshot
             * @function getTypeUrl
             * @memberof shometrics.v1.MetricSnapshot
             * @static
             * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns {string} The default type url
             */
            MetricSnapshot.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
                if (typeUrlPrefix === undefined) {
                    typeUrlPrefix = "type.googleapis.com";
                }
                return typeUrlPrefix + "/shometrics.v1.MetricSnapshot";
            };

            return MetricSnapshot;
        })();

        v1.MetricValue = (function() {

            /**
             * Properties of a MetricValue.
             * @memberof shometrics.v1
             * @interface IMetricValue
             * @property {number|null} [scalar] MetricValue scalar
             * @property {string|null} [text] MetricValue text
             * @property {string|null} [unit] MetricValue unit
             * @property {number|null} [progress] MetricValue progress
             */

            /**
             * Constructs a new MetricValue.
             * @memberof shometrics.v1
             * @classdesc Represents a MetricValue.
             * @implements IMetricValue
             * @constructor
             * @param {shometrics.v1.IMetricValue=} [properties] Properties to set
             */
            function MetricValue(properties) {
                if (properties)
                    for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null)
                            this[keys[i]] = properties[keys[i]];
            }

            /**
             * MetricValue scalar.
             * @member {number|null|undefined} scalar
             * @memberof shometrics.v1.MetricValue
             * @instance
             */
            MetricValue.prototype.scalar = null;

            /**
             * MetricValue text.
             * @member {string|null|undefined} text
             * @memberof shometrics.v1.MetricValue
             * @instance
             */
            MetricValue.prototype.text = null;

            /**
             * MetricValue unit.
             * @member {string} unit
             * @memberof shometrics.v1.MetricValue
             * @instance
             */
            MetricValue.prototype.unit = "";

            /**
             * MetricValue progress.
             * @member {number} progress
             * @memberof shometrics.v1.MetricValue
             * @instance
             */
            MetricValue.prototype.progress = 0;

            // OneOf field names bound to virtual getters and setters
            let $oneOfFields;

            /**
             * MetricValue data.
             * @member {"scalar"|"text"|undefined} data
             * @memberof shometrics.v1.MetricValue
             * @instance
             */
            Object.defineProperty(MetricValue.prototype, "data", {
                get: $util.oneOfGetter($oneOfFields = ["scalar", "text"]),
                set: $util.oneOfSetter($oneOfFields)
            });

            /**
             * Creates a new MetricValue instance using the specified properties.
             * @function create
             * @memberof shometrics.v1.MetricValue
             * @static
             * @param {shometrics.v1.IMetricValue=} [properties] Properties to set
             * @returns {shometrics.v1.MetricValue} MetricValue instance
             */
            MetricValue.create = function create(properties) {
                return new MetricValue(properties);
            };

            /**
             * Encodes the specified MetricValue message. Does not implicitly {@link shometrics.v1.MetricValue.verify|verify} messages.
             * @function encode
             * @memberof shometrics.v1.MetricValue
             * @static
             * @param {shometrics.v1.IMetricValue} message MetricValue message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            MetricValue.encode = function encode(message, writer) {
                if (!writer)
                    writer = $Writer.create();
                if (message.scalar != null && Object.hasOwnProperty.call(message, "scalar"))
                    writer.uint32(/* id 1, wireType 1 =*/9).double(message.scalar);
                if (message.text != null && Object.hasOwnProperty.call(message, "text"))
                    writer.uint32(/* id 2, wireType 2 =*/18).string(message.text);
                if (message.unit != null && Object.hasOwnProperty.call(message, "unit"))
                    writer.uint32(/* id 3, wireType 2 =*/26).string(message.unit);
                if (message.progress != null && Object.hasOwnProperty.call(message, "progress"))
                    writer.uint32(/* id 4, wireType 1 =*/33).double(message.progress);
                return writer;
            };

            /**
             * Encodes the specified MetricValue message, length delimited. Does not implicitly {@link shometrics.v1.MetricValue.verify|verify} messages.
             * @function encodeDelimited
             * @memberof shometrics.v1.MetricValue
             * @static
             * @param {shometrics.v1.IMetricValue} message MetricValue message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            MetricValue.encodeDelimited = function encodeDelimited(message, writer) {
                return this.encode(message, writer).ldelim();
            };

            /**
             * Decodes a MetricValue message from the specified reader or buffer.
             * @function decode
             * @memberof shometrics.v1.MetricValue
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {shometrics.v1.MetricValue} MetricValue
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            MetricValue.decode = function decode(reader, length, error) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                let end = length === undefined ? reader.len : reader.pos + length, message = new $root.shometrics.v1.MetricValue();
                while (reader.pos < end) {
                    let tag = reader.uint32();
                    if (tag === error)
                        break;
                    switch (tag >>> 3) {
                    case 1: {
                            message.scalar = reader.double();
                            break;
                        }
                    case 2: {
                            message.text = reader.string();
                            break;
                        }
                    case 3: {
                            message.unit = reader.string();
                            break;
                        }
                    case 4: {
                            message.progress = reader.double();
                            break;
                        }
                    default:
                        reader.skipType(tag & 7);
                        break;
                    }
                }
                return message;
            };

            /**
             * Decodes a MetricValue message from the specified reader or buffer, length delimited.
             * @function decodeDelimited
             * @memberof shometrics.v1.MetricValue
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @returns {shometrics.v1.MetricValue} MetricValue
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            MetricValue.decodeDelimited = function decodeDelimited(reader) {
                if (!(reader instanceof $Reader))
                    reader = new $Reader(reader);
                return this.decode(reader, reader.uint32());
            };

            /**
             * Verifies a MetricValue message.
             * @function verify
             * @memberof shometrics.v1.MetricValue
             * @static
             * @param {Object.<string,*>} message Plain object to verify
             * @returns {string|null} `null` if valid, otherwise the reason why it is not
             */
            MetricValue.verify = function verify(message) {
                if (typeof message !== "object" || message === null)
                    return "object expected";
                let properties = {};
                if (message.scalar != null && message.hasOwnProperty("scalar")) {
                    properties.data = 1;
                    if (typeof message.scalar !== "number")
                        return "scalar: number expected";
                }
                if (message.text != null && message.hasOwnProperty("text")) {
                    if (properties.data === 1)
                        return "data: multiple values";
                    properties.data = 1;
                    if (!$util.isString(message.text))
                        return "text: string expected";
                }
                if (message.unit != null && message.hasOwnProperty("unit"))
                    if (!$util.isString(message.unit))
                        return "unit: string expected";
                if (message.progress != null && message.hasOwnProperty("progress"))
                    if (typeof message.progress !== "number")
                        return "progress: number expected";
                return null;
            };

            /**
             * Creates a MetricValue message from a plain object. Also converts values to their respective internal types.
             * @function fromObject
             * @memberof shometrics.v1.MetricValue
             * @static
             * @param {Object.<string,*>} object Plain object
             * @returns {shometrics.v1.MetricValue} MetricValue
             */
            MetricValue.fromObject = function fromObject(object) {
                if (object instanceof $root.shometrics.v1.MetricValue)
                    return object;
                let message = new $root.shometrics.v1.MetricValue();
                if (object.scalar != null)
                    message.scalar = Number(object.scalar);
                if (object.text != null)
                    message.text = String(object.text);
                if (object.unit != null)
                    message.unit = String(object.unit);
                if (object.progress != null)
                    message.progress = Number(object.progress);
                return message;
            };

            /**
             * Creates a plain object from a MetricValue message. Also converts values to other types if specified.
             * @function toObject
             * @memberof shometrics.v1.MetricValue
             * @static
             * @param {shometrics.v1.MetricValue} message MetricValue
             * @param {$protobuf.IConversionOptions} [options] Conversion options
             * @returns {Object.<string,*>} Plain object
             */
            MetricValue.toObject = function toObject(message, options) {
                if (!options)
                    options = {};
                let object = {};
                if (options.defaults) {
                    object.unit = "";
                    object.progress = 0;
                }
                if (message.scalar != null && message.hasOwnProperty("scalar")) {
                    object.scalar = options.json && !isFinite(message.scalar) ? String(message.scalar) : message.scalar;
                    if (options.oneofs)
                        object.data = "scalar";
                }
                if (message.text != null && message.hasOwnProperty("text")) {
                    object.text = message.text;
                    if (options.oneofs)
                        object.data = "text";
                }
                if (message.unit != null && message.hasOwnProperty("unit"))
                    object.unit = message.unit;
                if (message.progress != null && message.hasOwnProperty("progress"))
                    object.progress = options.json && !isFinite(message.progress) ? String(message.progress) : message.progress;
                return object;
            };

            /**
             * Converts this MetricValue to JSON.
             * @function toJSON
             * @memberof shometrics.v1.MetricValue
             * @instance
             * @returns {Object.<string,*>} JSON object
             */
            MetricValue.prototype.toJSON = function toJSON() {
                return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
            };

            /**
             * Gets the default type url for MetricValue
             * @function getTypeUrl
             * @memberof shometrics.v1.MetricValue
             * @static
             * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns {string} The default type url
             */
            MetricValue.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
                if (typeUrlPrefix === undefined) {
                    typeUrlPrefix = "type.googleapis.com";
                }
                return typeUrlPrefix + "/shometrics.v1.MetricValue";
            };

            return MetricValue;
        })();

        return v1;
    })();

    return shometrics;
})();

export { $root as default };
