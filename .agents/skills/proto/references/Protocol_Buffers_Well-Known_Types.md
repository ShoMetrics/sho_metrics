API documentation for the google.protobuf package.

## Index

-   [`Any`](https://protobuf.dev/reference/protobuf/google.protobuf/#any) (message)
-   [`Api`](https://protobuf.dev/reference/protobuf/google.protobuf/#api) (message)
-   [`BoolValue`](https://protobuf.dev/reference/protobuf/google.protobuf/#bool-value) (message)
-   [`BytesValue`](https://protobuf.dev/reference/protobuf/google.protobuf/#bytes-value) (message)
-   [`DoubleValue`](https://protobuf.dev/reference/protobuf/google.protobuf/#double-value) (message)
-   [`Duration`](https://protobuf.dev/reference/protobuf/google.protobuf/#duration) (message)
-   [`Empty`](https://protobuf.dev/reference/protobuf/google.protobuf/#empty) (message)
-   [`Enum`](https://protobuf.dev/reference/protobuf/google.protobuf/#enum) (message)
-   [`EnumValue`](https://protobuf.dev/reference/protobuf/google.protobuf/#enum-value) (message)
-   [`Field`](https://protobuf.dev/reference/protobuf/google.protobuf/#field) (message)
-   [`Field.Cardinality`](https://protobuf.dev/reference/protobuf/google.protobuf/#field-cardinality) (enum)
-   [`Field.Kind`](https://protobuf.dev/reference/protobuf/google.protobuf/#field-kind) (enum)
-   [`FieldMask`](https://protobuf.dev/reference/protobuf/google.protobuf/#field-mask) (message)
-   [`FloatValue`](https://protobuf.dev/reference/protobuf/google.protobuf/#float-value) (message)
-   [`Int32Value`](https://protobuf.dev/reference/protobuf/google.protobuf/#int32-value) (message)
-   [`Int64Value`](https://protobuf.dev/reference/protobuf/google.protobuf/#int64-value) (message)
-   [`ListValue`](https://protobuf.dev/reference/protobuf/google.protobuf/#list-value) (message)
-   [`Method`](https://protobuf.dev/reference/protobuf/google.protobuf/#method) (message)
-   [`Mixin`](https://protobuf.dev/reference/protobuf/google.protobuf/#mixin) (message)
-   [`NullValue`](https://protobuf.dev/reference/protobuf/google.protobuf/#null-value) (enum)
-   [`Option`](https://protobuf.dev/reference/protobuf/google.protobuf/#option) (message)
-   [`SourceContext`](https://protobuf.dev/reference/protobuf/google.protobuf/#source-context) (message)
-   [`StringValue`](https://protobuf.dev/reference/protobuf/google.protobuf/#string-value) (message)
-   [`Struct`](https://protobuf.dev/reference/protobuf/google.protobuf/#struct) (message)
-   [`Syntax`](https://protobuf.dev/reference/protobuf/google.protobuf/#syntax) (enum)
-   [`Timestamp`](https://protobuf.dev/reference/protobuf/google.protobuf/#timestamp) (message)
-   [`Type`](https://protobuf.dev/reference/protobuf/google.protobuf/#type) (message)
-   [`UInt32Value`](https://protobuf.dev/reference/protobuf/google.protobuf/#uint32-value) (message)
-   [`UInt64Value`](https://protobuf.dev/reference/protobuf/google.protobuf/#uint64-value) (message)
-   [`Value`](https://protobuf.dev/reference/protobuf/google.protobuf/#value) (message)

Well-Known Types that end in “`Value`” are wrapper messages for other types, such as `BoolValue` and `EnumValue`. These are now obsolete. The only reasons to use wrappers today would be:

-   Wire compatibility with messages that already use them.
-   If you want to put a scalar value into an `Any` message.

In most cases, there are better options:

-   For new messages, it’s better to use regular explicit-presence fields (`optional` in proto2/proto3, regular field in edition >= 2023).
-   Extensions are generally a better option than `Any` fields.

## Any

`Any` contains an arbitrary serialized message along with a URL that describes the type of the serialized message.

#### JSON

The JSON representation of an `Any` value uses the regular representation of the deserialized, embedded message, with an additional field `@type` which contains the type URL. Example:

```proto
package google.profile; message Person { string first_name = 1; string last_name = 2; }
```

```json
{ "@type": "type.googleapis.com/google.profile.Person", "firstName": <string>, "lastName": <string> }
```

If the embedded message type is well-known and has a custom JSON representation, that representation will be embedded adding a field `value` which holds the custom JSON in addition to the `@type` field. Example (for message `google.protobuf.Duration`):

```json
{ "@type": "type.googleapis.com/google.protobuf.Duration", "value": "1.212s" }
```

| Field name | Type | Description |
| --- | --- | --- |
| `type_url` | `string` | 
A URL/resource name whose content describes the type of the serialized message.

For URLs which use the schema `http`, `https`, or no schema, the following restrictions and interpretations apply:

-   If no schema is provided, `https` is assumed.
-   The last segment of the URL's path must represent the fully qualified name of the type (as in `path/google.protobuf.Duration`).
-   An HTTP GET on the URL must yield a `[google.protobuf.Type](https://protobuf.dev/reference/protobuf/google.protobuf/#type)` value in binary format, or produce an error.
-   Applications are allowed to cache lookup results based on the URL, or have them precompiled into a binary to avoid any lookup. Therefore, binary compatibility needs to be preserved on changes to types. (Use versioned type names to manage breaking changes.)

Schemas other than `http`, `https` (or the empty schema) might be used with implementation specific semantics.

 |
| `value` | `bytes` | Must be valid serialized data of the above specified type. |

## Api

Api is a light-weight descriptor for a protocol buffer service.

| Field name | Type | Description |
| --- | --- | --- |
| `name` | `string` | The fully qualified name of this api, including package name followed by the api's simple name. |
| `methods` | `[Method](https://protobuf.dev/reference/protobuf/google.protobuf/#method)` | The methods of this api, in unspecified order. |
| `options` | `[Option](https://protobuf.dev/reference/protobuf/google.protobuf/#option)` | Any metadata attached to the API. |
| `version` | `string` | 
A version string for this api. If specified, must have the form `major-version.minor-version`, as in `1.10`. If the minor version is omitted, it defaults to zero. If the entire version field is empty, the major version is derived from the package name, as outlined below. If the field is not empty, the version in the package name will be verified to be consistent with what is provided here.

The versioning schema uses [semantic versioning](http://semver.org/) where the major version number indicates a breaking change and the minor version an additive, non-breaking change. Both version numbers are signals to users what to expect from different versions, and should be carefully chosen based on the product plan.

The major version is also reflected in the package name of the API, which must end in `v<major-version>`, as in `google.feature.v1`. For major versions 0 and 1, the suffix can be omitted. Zero major versions must only be used for experimental, none-GA apis.

 |
| `source_context` | `` `[SourceContext](https://protobuf.dev/reference/protobuf/google.protobuf/#source-context)` `` | Source context for the protocol buffer service represented by this message. |
| `mixins` | `` `[Mixin](https://protobuf.dev/reference/protobuf/google.protobuf/#mixin)` `` | Included APIs. See `[Mixin](https://protobuf.dev/reference/protobuf/google.protobuf/#mixin)`. |
| `syntax` | `[Syntax](https://protobuf.dev/reference/protobuf/google.protobuf/#syntax)` | The source syntax of the service. |

## BoolValue

Wrapper message for `bool`.

The JSON representation for `BoolValue` is JSON `true` and `false`.

| Field name | Type | Description |
| --- | --- | --- |
| `value` | `bool` | The bool value. |

## BytesValue

Wrapper message for `bytes`.

The JSON representation for `BytesValue` is JSON string.

| Field name | Type | Description |
| --- | --- | --- |
| `value` | `bytes` | The bytes value. |

## DoubleValue

Wrapper message for `double`.

The JSON representation for `DoubleValue` is JSON number.

| Field name | Type | Description |
| --- | --- | --- |
| `value` | `double` | The double value. |

## Duration

A Duration represents a signed, fixed-length span of time represented as a count of seconds and fractions of seconds at nanosecond resolution. It is independent of any calendar and concepts like "day" or "month". It is related to Timestamp in that the difference between two Timestamp values is a Duration and it can be added or subtracted from a Timestamp. Range is approximately +-10,000 years.

Example 1: Compute Duration from two Timestamps in pseudo code.

```c
Timestamp start = ...; Timestamp end = ...; Duration duration = ...; duration.seconds = end.seconds - start.seconds; duration.nanos = end.nanos - start.nanos; if (duration.seconds < 0 && duration.nanos > 0) { duration.seconds += 1; duration.nanos -= 1000000000; } else if (duration.seconds > 0 && duration.nanos < 0) { duration.seconds -= 1; duration.nanos += 1000000000; }
```

Example 2: Compute Timestamp from Timestamp + Duration in pseudo code.

```c
Timestamp start = ...; Duration duration = ...; Timestamp end = ...; end.seconds = start.seconds + duration.seconds; end.nanos = start.nanos + duration.nanos; if (end.nanos < 0) { end.seconds -= 1; end.nanos += 1000000000; } else if (end.nanos >= 1000000000) { end.seconds += 1; end.nanos -= 1000000000; }
```

The JSON representation for `Duration` is a `String` that ends in `s` to indicate seconds and is preceded by the number of seconds, with nanoseconds expressed as fractional seconds.

| Field name | Type | Description |
| --- | --- | --- |
| `seconds` | `int64` | Signed seconds of the span of time. Must be from -315,576,000,000 to +315,576,000,000 inclusive. |
| `nanos` | `int32` | Signed fractions of a second at nanosecond resolution of the span of time. Durations less than one second are represented with a 0 `seconds` field and a positive or negative `nanos` field. For durations of one second or more, a non-zero value for the `nanos` field must be of the same sign as the `seconds` field. Must be from -999,999,999 to +999,999,999 inclusive. |

## Empty

A generic empty message that you can re-use to avoid defining duplicated empty messages in your APIs. A typical example is to use it as the request or the response type of an API method. For instance:

```proto
service Foo { rpc Bar(google.protobuf.Empty) returns (google.protobuf.Empty); }
```

The JSON representation for `Empty` is empty JSON object `{}`.

## Enum

Enum type definition

| Field name | Type | Description |
| --- | --- | --- |
| `name` | `string` | Enum type name. |
| `enumvalue` | `[EnumValue](https://protobuf.dev/reference/protobuf/google.protobuf/#enum-value)` | Enum value definitions. |
| `options` | `[Option](https://protobuf.dev/reference/protobuf/google.protobuf/#option)` | Protocol buffer options. |
| `source_context` | `[SourceContext](https://protobuf.dev/reference/protobuf/google.protobuf/#source-context)` | The source context. |
| `syntax` | `[Syntax](https://protobuf.dev/reference/protobuf/google.protobuf/#syntax)` | The source syntax. |
| `edition` | `string` | The source edition if `syntax` is `SYNTAX_EDITIONS`. |

## EnumValue

Enum value definition.

| Field name | Type | Description |
| --- | --- | --- |
| `name` | `string` | Enum value name. |
| `number` | `int32` | Enum value number. |
| `options` | `[Option](https://protobuf.dev/reference/protobuf/google.protobuf/#option)` | Protocol buffer options. |

## Field

A single field of a message type.

| Field name | Type | Description |
| --- | --- | --- |
| `kind` | `[Kind](https://protobuf.dev/reference/protobuf/google.protobuf/#field-kind)` | The field type. |
| `cardinality` | `[Cardinality](https://protobuf.dev/reference/protobuf/google.protobuf/#field-cardinality)` | The field cardinality. |
| `number` | `int32` | The field number. |
| `name` | `string` | The field name. |
| `type_url` | `string` | The field type URL, without the scheme, for message or enumeration types. Example: `"type.googleapis.com/google.protobuf.Timestamp"`. |
| `oneof_index` | `int32` | The index of the field type in `Type.oneofs`, for message or enumeration types. The first type has index 1; zero means the type is not in the list. |
| `packed` | `bool` | Whether to use alternative packed wire representation. |
| `options` | `[Option](https://protobuf.dev/reference/protobuf/google.protobuf/#option)` | The protocol buffer options. |
| `json_name` | `string` | The field JSON name. |
| `default_value` | `string` | The string value of the default value of this field. Proto2 syntax only. |

## Cardinality

Whether a field is optional, required, or repeated.

| Enum value | Description |
| --- | --- |
| `CARDINALITY_UNKNOWN` | For fields with unknown cardinality. |
| `CARDINALITY_OPTIONAL` | For optional fields. |
| `CARDINALITY_REQUIRED` | For required fields. Proto2 syntax only. |
| `CARDINALITY_REPEATED` | For repeated fields. |

## Kind

Basic field types.

| Enum value | Description |
| --- | --- |
| `TYPE_UNKNOWN` | Field type unknown. |
| `TYPE_DOUBLE` | Field type double. |
| `TYPE_FLOAT` | Field type float. |
| `TYPE_INT64` | Field type int64. |
| `TYPE_UINT64` | Field type uint64. |
| `TYPE_INT32` | Field type int32. |
| `TYPE_FIXED64` | Field type fixed64. |
| `TYPE_FIXED32` | Field type fixed32. |
| `TYPE_BOOL` | Field type bool. |
| `TYPE_STRING` | Field type string. |
| `TYPE_GROUP` | Field type group. Proto2 syntax only, and deprecated. |
| `TYPE_MESSAGE` | Field type message. |
| `TYPE_BYTES` | Field type bytes. |
| `TYPE_UINT32` | Field type uint32. |
| `TYPE_ENUM` | Field type enum. |
| `TYPE_SFIXED32` | Field type sfixed32. |
| `TYPE_SFIXED64` | Field type sfixed64. |
| `TYPE_SINT32` | Field type sint32. |
| `TYPE_SINT64` | Field type sint64. |

## FieldMask

`FieldMask` represents a set of symbolic field paths, for example:

```proto
paths: "f.a" paths: "f.b.d"
```

Here `f` represents a field in some root message, `a` and `b` fields in the message found in `f`, and `d` a field found in the message in `f.b`.

Field masks are used to specify a subset of fields that should be returned by a get operation (a _projection_), or modified by an update operation. Field masks also have a custom JSON encoding (see below).

#### Field Masks in Projections

When a `FieldMask` specifies a _projection_, the API will filter the response message (or sub-message) to contain only those fields specified in the mask. For example, consider this "pre-masking" response message:

```proto
f { a : 22 b { d : 1 x : 2 } y : 13 } z: 8
```

After applying the mask in the previous example, the API response will not contain specific values for fields x, y, or z (their value will be set to the default, and omitted in proto text output):

A repeated field is not allowed except at the last position of a field mask.

If a `FieldMask` object is not present in a get operation, the operation applies to all fields (as if a FieldMask of all fields had been specified).

Note that a field mask does not necessarily apply to the top-level response message. In case of a REST get operation, the field mask applies directly to the response, but in case of a REST list operation, the mask instead applies to each individual message in the returned resource list. In case of a REST custom method, other definitions may be used. Where the mask applies will be clearly documented together with its declaration in the API. In any case, the effect on the returned resource/resources is required behavior for APIs.

#### Field Masks in Update Operations

A field mask in update operations specifies which fields of the targeted resource are going to be updated. The API is required to only change the values of the fields as specified in the mask and leave the others untouched. If a resource is passed in to describe the updated values, the API ignores the values of all fields not covered by the mask.

In order to reset a field’s value to the default, the field must be in the mask and set to the default value in the provided resource. Hence, in order to reset all fields of a resource, provide a default instance of the resource and set all fields in the mask, or do not provide a mask as described below.

If a field mask is not present on update, the operation applies to all fields (as if a field mask of all fields has been specified). Note that in the presence of schema evolution, this may mean that fields the client does not know and has therefore not filled into the request will be reset to their default. If this is unwanted behavior, a specific service may require a client to always specify a field mask, producing an error if not.

As with get operations, the location of the resource which describes the updated values in the request message depends on the operation kind. In any case, the effect of the field mask is required to be honored by the API.

##### Considerations for HTTP REST

The HTTP kind of an update operation which uses a field mask must be set to PATCH instead of PUT in order to satisfy HTTP semantics (PUT must only be used for full updates).

#### JSON Encoding of Field Masks

In JSON, a field mask is encoded as a single string where paths are separated by a comma. Fields name in each path are converted to/from lower-camel naming conventions.

As an example, consider the following message declarations:

```proto
message Profile { User user = 1; Photo photo = 2; } message User { string display_name = 1; string address = 2; }
```

In proto a field mask for `Profile` may look as such:

```proto
mask { paths: "user.display_name" paths: "photo" }
```

In JSON, the same mask is represented as below:

```json
{ mask: "user.displayName,photo" }
```

| Field name | Type | Description |
| --- | --- | --- |
| `paths` | `string` | The set of field mask paths. |

## FloatValue

Wrapper message for `float`.

The JSON representation for `FloatValue` is JSON number.

| Field name | Type | Description |
| --- | --- | --- |
| `value` | `float` | The float value. |

## Int32Value

Wrapper message for `int32`.

The JSON representation for `Int32Value` is JSON number.

| Field name | Type | Description |
| --- | --- | --- |
| `value` | `int32` | The int32 value. |

## Int64Value

Wrapper message for `int64`.

The JSON representation for `Int64Value` is JSON string.

| Field name | Type | Description |
| --- | --- | --- |
| `value` | `int64` | The int64 value. |

## ListValue

`ListValue` is a wrapper around a repeated field of values.

The JSON representation for `ListValue` is JSON array.

| Field name | Type | Description |
| --- | --- | --- |
| `values` | `[Value](https://protobuf.dev/reference/protobuf/google.protobuf/#value)` | Repeated field of dynamically typed values. |

## Method

Method represents a method of an api.

| Field name | Type | Description |
| --- | --- | --- |
| `name` | `string` | The simple name of this method. |
| `request_type_url` | `string` | A URL of the input message type. |
| `request_streaming` | `bool` | If true, the request is streamed. |
| `response_type_url` | `string` | The URL of the output message type. |
| `response_streaming` | `bool` | If true, the response is streamed. |
| `options` | `[Option](https://protobuf.dev/reference/protobuf/google.protobuf/#option)` | Any metadata attached to the method. |
| `syntax` | `[Syntax](https://protobuf.dev/reference/protobuf/google.protobuf/#syntax)` | The source syntax of this method. |

## Mixin

Declares an API to be included in this API. The including API must redeclare all the methods from the included API, but documentation and options are inherited as follows:

-   If after comment and whitespace stripping, the documentation string of the redeclared method is empty, it will be inherited from the original method.
    
-   Each annotation belonging to the service config (http, visibility) which is not set in the redeclared method will be inherited.
    
-   If an http annotation is inherited, the path pattern will be modified as follows. Any version prefix will be replaced by the version of the including API plus the `root` path if specified.
    

Example of a simple mixin:

```proto
package google.acl.v1; service AccessControl { // Get the underlying ACL object. rpc GetAcl(GetAclRequest) returns (Acl) { option (google.api.http).get = "/v1/{resource=**}:getAcl"; } } package google.storage.v2; service Storage { // rpc GetAcl(GetAclRequest) returns (Acl); // Get a data record. rpc GetData(GetDataRequest) returns (Data) { option (google.api.http).get = "/v2/{resource=**}"; } }
```

Example of a mixin configuration:

```fallback
apis: - name: google.storage.v2.Storage mixins: - name: google.acl.v1.AccessControl
```

The mixin construct implies that all methods in `AccessControl` are also declared with same name and request/response types in `Storage`. A documentation generator or annotation processor will see the effective `Storage.GetAcl` method after inheriting documentation and annotations as follows:

```proto
service Storage { // Get the underlying ACL object. rpc GetAcl(GetAclRequest) returns (Acl) { option (google.api.http).get = "/v2/{resource=**}:getAcl"; } ... }
```

Note how the version in the path pattern changed from `v1` to `v2`.

If the `root` field in the mixin is specified, it should be a relative path under which inherited HTTP paths are placed. Example:

```fallback
apis: - name: google.storage.v2.Storage mixins: - name: google.acl.v1.AccessControl root: acls
```

This implies the following inherited HTTP annotation:

```proto
service Storage { // Get the underlying ACL object. rpc GetAcl(GetAclRequest) returns (Acl) { option (google.api.http).get = "/v2/acls/{resource=**}:getAcl"; } ... }
```

| Field name | Type | Description |
| --- | --- | --- |
| `name` | `string` | The fully qualified name of the API which is included. |
| `root` | `string` | If non-empty specifies a path under which inherited HTTP paths are rooted. |

## NullValue

`NullValue` is a singleton enumeration to represent the null value for the `Value` type union.

The JSON representation for `NullValue` is JSON `null`.

| Enum value | Description |
| --- | --- |
| `NULL_VALUE` | Null value. |

## Option

A protocol buffer option, which can be attached to a message, field, enumeration, etc.

| Field name | Type | Description |
| --- | --- | --- |
| `name` | `string` | The option's name. For example, `"java_package"`. |
| `value` | `[Any](https://protobuf.dev/reference/protobuf/google.protobuf/#any)` | The option's value. For example, `"com.google.protobuf"`. |

## SourceContext

`SourceContext` represents information about the source of a protobuf element, like the file in which it is defined.

| Field name | Type | Description |
| --- | --- | --- |
| `file_name` | `string` | The path-qualified name of the .proto file that contained the associated protobuf element. For example: `"google/protobuf/source.proto"`. |

## StringValue

Wrapper message for `string`.

The JSON representation for `StringValue` is JSON string.

| Field name | Type | Description |
| --- | --- | --- |
| `value` | `string` | The string value. |

## Struct

`Struct` represents a structured data value, consisting of fields which map to dynamically typed values. In some languages, `Struct` might be supported by a native representation. For example, in scripting languages like JS a struct is represented as an object. The details of that representation are described together with the proto support for the language.

The JSON representation for `Struct` is JSON object.

| Field name | Type | Description |
| --- | --- | --- |
| `fields` | `map<string, [Value](https://protobuf.dev/reference/protobuf/google.protobuf/#value)>` | Map of dynamically typed values. |

## Syntax

The syntax in which a protocol buffer element is defined.

| Enum value | Description |
| --- | --- |
| `SYNTAX_PROTO2` | Syntax `proto2`. |
| `SYNTAX_PROTO3` | Syntax `proto3`. |
| `SYNTAX_EDITIONS` | Syntax uses the `edition` construct. |

## Timestamp

A Timestamp represents a point in time independent of any time zone or calendar, represented as seconds and fractions of seconds at nanosecond resolution in UTC Epoch time. It is encoded using the Proleptic Gregorian Calendar which extends the Gregorian calendar backwards to year one. It is encoded assuming all minutes are 60 seconds long, i.e. leap seconds are “smeared” so that no leap second table is needed for interpretation. Range is from 0001-01-01T00:00:00Z to 9999-12-31T23:59:59.999999999Z. By restricting to that range, we ensure that we can convert to and from RFC 3339 date strings. See [https://www.ietf.org/rfc/rfc3339.txt](https://www.ietf.org/rfc/rfc3339.txt).

The Timestamp type is encoded as a string in the RFC 3339 format: “`{year}-{month}-{day}T{hour}:{min}:{sec}[.{frac_sec}]Z`”, where `{year}` is always expressed using four digits while `{month}`, `{day}`, `{hour}`, `{min}`, and `{sec}` are zero-padded to two digits each. The fractional seconds, which can go up to 9 digits (that is, up to 1 nanosecond resolution), are optional. The “Z” suffix indicates the timezone (“UTC”); the timezone is required. A proto3 JSON serializer should always use UTC (as indicated by “Z”) when printing the Timestamp type and a proto3 JSON parser should be able to accept both UTC and other timezones (as indicated by an offset).

Example 1: Compute Timestamp from POSIX `time()`.

```cpp
Timestamp timestamp; timestamp.set_seconds(time(NULL)); timestamp.set_nanos(0);
```

Example 2: Compute Timestamp from POSIX `gettimeofday()`.

```cpp
struct timeval tv; gettimeofday(&tv, NULL); Timestamp timestamp; timestamp.set_seconds(tv.tv_sec); timestamp.set_nanos(tv.tv_usec * 1000);
```

Example 3: Compute Timestamp from Win32 `GetSystemTimeAsFileTime()`.

```cpp
FILETIME ft; GetSystemTimeAsFileTime(&ft); UINT64 ticks = (((UINT64)ft.dwHighDateTime) << 32) | ft.dwLowDateTime; // A Windows tick is 100 nanoseconds. Windows epoch 1601-01-01T00:00:00Z // is 11644473600 seconds before Unix epoch 1970-01-01T00:00:00Z. Timestamp timestamp; timestamp.set_seconds((INT64) ((ticks / 10000000) - 11644473600LL)); timestamp.set_nanos((INT32) ((ticks % 10000000) * 100));
```

Example 4: Compute Timestamp from Java `System.currentTimeMillis()`.

```java
long millis = System.currentTimeMillis(); Timestamp timestamp = Timestamp.newBuilder().setSeconds(millis / 1000) .setNanos((int) ((millis % 1000) * 1000000)).build();
```

Example 5: Compute Timestamp from current time in Python.

```py
now = time.time() seconds = int(now) nanos = int((now - seconds) * 10**9) timestamp = Timestamp(seconds=seconds, nanos=nanos)
```

| Field name | Type | Description |
| --- | --- | --- |
| `seconds` | `int64` | Represents seconds of UTC time since Unix epoch 1970-01-01T00:00:00Z. Must be from 0001-01-01T00:00:00Z to 9999-12-31T23:59:59Z inclusive. |
| `nanos` | `int32` | Non-negative fractions of a second at nanosecond resolution. Negative second values with fractions must still have non-negative nanos values that count forward in time. Must be from 0 to 999,999,999 inclusive. |

## Type

A protocol buffer message type.

| Field name | Type | Description |
| --- | --- | --- |
| `name` | `string` | The fully qualified message name. |
| `fields` | `[Field](https://protobuf.dev/reference/protobuf/google.protobuf/#field)` | The list of fields. |
| `oneofs` | `string` | The list of types appearing in `oneof` definitions in this type. |
| `options` | `[Option](https://protobuf.dev/reference/protobuf/google.protobuf/#option)` | The protocol buffer options. |
| `source_context` | `[SourceContext](https://protobuf.dev/reference/protobuf/google.protobuf/#source-context)` | The source context. |
| `syntax` | `[Syntax](https://protobuf.dev/reference/protobuf/google.protobuf/#syntax)` | The source syntax. |

## UInt32Value

Wrapper message for `uint32`.

The JSON representation for `UInt32Value` is JSON number.

| Field name | Type | Description |
| --- | --- | --- |
| `value` | `uint32` | The uint32 value. |

## UInt64Value

Wrapper message for `uint64`.

The JSON representation for `UInt64Value` is JSON string.

| Field name | Type | Description |
| --- | --- | --- |
| `value` | `uint64` | The uint64 value. |

## Value

`Value` represents a dynamically typed value which can be either null, a number, a string, a boolean, a recursive struct value, or a list of values. A producer of value is expected to set one of that variants, absence of any variant indicates an error.

The JSON representation for `Value` is JSON value.

| Field name | Type | Description |
| --- | --- | --- |
| Union field, only one of the following: |
| `null_value` | `[NullValue](https://protobuf.dev/reference/protobuf/google.protobuf/#null-value)` | Represents a null value. |
| `number_value` | `double` | Represents a double value. Note that attempting to serialize NaN or Infinity results in error. (We can't serialize these as string "NaN" or "Infinity" values like we do for regular fields, because they would parse as string\_value, not number\_value). |
| `string_value` | `string` | Represents a string value. |
| `bool_value` | `bool` | Represents a boolean value. |
| `struct_value` | `[Struct](https://protobuf.dev/reference/protobuf/google.protobuf/#struct)` | Represents a structured value. |
| `list_value` | `[ListValue](https://protobuf.dev/reference/protobuf/google.protobuf/#list-value)` | Represents a repeated `Value`. |