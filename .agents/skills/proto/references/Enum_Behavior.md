Explains how enums currently work in Protocol Buffers vs. how they should work.

Enums behave differently in different language libraries. This topic covers the different behaviors as well as the plans to move protobufs to a state where they are consistent across all languages. If you’re looking for information on how to use enums in general, see the corresponding sections in the [proto2](https://protobuf.dev/programming-guides/proto2#enum), [proto3](https://protobuf.dev/programming-guides/proto3#enum), and [editions 2023](https://protobuf.dev/programming-guides/editions#enum) language guide topics.

## Definitions

Enums have two distinct flavors (_open_ and _closed_). They behave identically except in their handling of unknown values. Practically, this means that simple cases work the same, but some corner cases have interesting implications.

For the purpose of explanation, let us assume we have the following `.proto` file (we are deliberately not specifying if this is a `syntax = "proto2"`, `syntax = "proto3"`, or `edition = "2023"` file right now):

```gdscript3
enum Enum { A = 0; B = 1; } message Msg { optional Enum enum = 1; }
```

The distinction between _open_ and _closed_ can be encapsulated in a single question:

> What happens when a program parses binary data that contains field 1 with the value `2`?

-   **Open** enums will parse the value `2` and store it directly in the field. Accessor will report the field as being _set_ and will return something that represents `2`.
-   **Closed** enums will parse the value `2` and store it in the message’s unknown field set. Accessors will report the field as being _unset_ and will return the enum’s default value.

## Implications of _Closed_ Enums

The behavior of _closed_ enums has unexpected consequences when parsing a repeated field. When a `repeated Enum` field is parsed, all unknown values will be placed in the [unknown field](https://protobuf.dev/programming-guides/proto3/#unknowns) set. When it is serialized those unknown values will be written again, _but not in their original place in the list_. For example, given the `.proto` file:

```gdscript3
enum Enum { A = 0; B = 1; } message Msg { repeated Enum r = 1; }
```

A wire format containing the values `[0, 2, 1, 2]` for field 1 will parse so that the repeated field contains `[0, 1]` and the value `[2, 2]` will end up stored as an unknown field. After reserializing the message, the wire format will correspond to `[0, 1, 2, 2]`.

Similarly, maps with _closed_ enums for their value will place entire entries (key and value) in the unknown fields whenever the value is unknown.

## History

Prior to the introduction of `syntax = "proto3"` all enums were _closed_. Proto3 and editions use _open_ enums specifically because of the unexpected behavior that _closed_ enums cause. You can use [`features.enum_type`](https://protobuf.dev/editions/features#enum_type) to explicitly set editions enums to closed, if needed.

## Specification

The following specifies the behavior of conformant implementations for protobuf. Because this is subtle, many implementations are out of conformance. See [Known Issues](https://protobuf.dev/programming-guides/enum/#known-issues) for details on how different implementations behave.

-   When a `proto2` file imports an enum defined in a `proto2` file, that enum should be treated as **closed**.
-   When a `proto3` file imports an enum defined in a `proto3` file, that enum should be treated as **open**.
-   When a `proto3` file imports an enum defined in a `proto2` file, the `protoc` compiler will produce an error.
-   When a `proto2` file imports an enum defined in a `proto3` file, that enum should be treated as **open**.

Editions honor whatever behavior the enum had in the file being imported from. Proto2 enums are always treated as closed, proto3 enums are always treated as open, and when importing from another editions file it uses the feature setting.

## Known Issues

### C++

All known C++ releases are out of conformance. When a `proto2` file imports an enum defined in a `proto3` file, C++ treats that field as a **closed** enum. Under editions, this behavior is represented by the deprecated field feature [`features.(pb.cpp).legacy_closed_enum`](https://protobuf.dev/editions/features#legacy_closed_enum). There are two options for moving to conformant behavior:

-   Remove the field feature. This is the recommended approach, but may cause runtime behavior changes. Without the feature, unrecognized integers will end up stored in the field cast to the enum type instead of being put into the unknown field set.
-   Change the enum to closed. This is discouraged, and can cause runtime behavior changes if _anybody else_ is using the enum. Unrecognized integers will end up in the unknown field set instead of those fields.

### C#

All known C# releases are out of conformance. C# treats all enums as **open**.

### Java

All known Java releases are out of conformance. When a `proto2` file imports an enum defined in a `proto3` file, Java treats that field as a **closed** enum.

Under editions, this behavior is represented by the deprecated field feature [`features.(pb.java).legacy_closed_enum`](https://protobuf.dev/editions/features#legacy_closed_enum)). There are two options for moving to conformant behavior:

-   Remove the field feature. This may cause runtime behavior changes. Without the feature, unrecognized integers will end up stored in the field and the `UNRECOGNIZED` value will be returned by the enum getter. Before, these values would be put into the unknown field set.
-   Change the enum to closed. If _anybody else_ is using it they may see runtime behavior changes. Unrecognized integers will end up in the unknown field set instead of those fields.

> **NOTE:** Java’s handling of **open** enums has surprising edge cases. Given the following definitions:
> 
> ```gdscript3
> syntax = "proto3"; enum Enum { A = 0; B = 1; } message Msg { repeated Enum name = 1; }
> ```
> 
> Java will generate the methods `Enum getName()` and `int getNameValue()`. The method `getName` will return `Enum.UNRECOGNIZED` for values outside the known set (such as `2`), whereas `getNameValue` will return `2`.
> 
> Similarly, Java will generate methods `Builder setName(Enum value)` and `Builder setNameValue(int value)`. The method `setName` will throw an exception when passed `Enum.UNRECOGNIZED`, whereas `setNameValue` will accept `2`.

### Kotlin

All known Kotlin releases are out of conformance. When a `proto2` file imports an enum defined in a `proto3` file, Kotlin treats that field as a **closed** enum.

Kotlin is built on Java and shares all of its oddities.

### Go

All known Go releases are out of conformance. Go treats all enums as **open**.

### JSPB

All known JSPB releases are out of conformance. JSPB treats all enums as **open**.

### PHP

PHP is conformant.

### Python

Python is conformant in versions above 4.22.0 (released 2023 Q1).

Older versions which are no longer supported are out of conformance. When a `proto2` file imports an enum defined in a `proto3` file, non-conformant Python versions treat that field as a **closed** enum.

### Ruby

All known Ruby releases are out of conformance. Ruby treats all enums as **open**.

### Objective-C

Objective-C is conformant in versions above 3.22.0 (released 2023 Q1).

Older versions which are no longer supported and are out of conformance. When a `proto2` file imports an enum defined in a `proto3` file, non-conformant ObjC versions treat that field as a **closed** enum.

### Swift

Swift is conformant.

### Dart

Dart treats all enums as **closed**.