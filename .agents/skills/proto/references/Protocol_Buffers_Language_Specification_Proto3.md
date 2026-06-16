Language specification reference for the Protocol Buffers language (Proto3).

The syntax is specified using [Extended Backus-Naur Form (EBNF)](https://en.wikipedia.org/wiki/Extended_Backus%E2%80%93Naur_Form):

```fallback
| alternation () grouping [] option (zero or one time) {} repetition (any number of times)
```

For more information about using proto3, see the [language guide](https://protobuf.dev/programming-guides/proto3).

## Lexical Elements

### Letters and Digits

```fallback
letter = "A" ... "Z" | "a" ... "z" decimalDigit = "0" ... "9" octalDigit = "0" ... "7" hexDigit = "0" ... "9" | "A" ... "F" | "a" ... "f"
```

### Identifiers

```gdscript3
ident = letter { letter | decimalDigit | "_" } fullIdent = ident { "." ident } messageName = ident enumName = ident fieldName = ident oneofName = ident mapName = ident serviceName = ident rpcName = ident messageType = [ "." ] { ident "." } messageName enumType = [ "." ] { ident "." } enumName
```

### Integer Literals

```fallback
intLit = decimalLit | octalLit | hexLit decimalLit = [-] ( "1" ... "9" ) { decimalDigit } octalLit = [-] "0" { octalDigit } hexLit = [-] "0" ( "x" | "X" ) hexDigit { hexDigit }
```

### Floating-point Literals

```fallback
floatLit = [-] ( decimals "." [ decimals ] [ exponent ] | decimals exponent | "."decimals [ exponent ] ) | "inf" | "nan" decimals = [-] decimalDigit { decimalDigit } exponent = ( "e" | "E" ) [ "+" | "-" ] decimals
```

### Boolean

```fallback
boolLit = "true" | "false"
```

### String Literals

```fallback
strLit = strLitSingle { strLitSingle } strLitSingle = ( "'" { charValue } "'" ) | ( '"' { charValue } '"' ) charValue = hexEscape | octEscape | charEscape | unicodeEscape | unicodeLongEscape | /[^\0\n\\]/ hexEscape = '\' ( "x" | "X" ) hexDigit [ hexDigit ] octEscape = '\' octalDigit [ octalDigit [ octalDigit ] ] charEscape = '\' ( "a" | "b" | "f" | "n" | "r" | "t" | "v" | '\' | "'" | '"' ) unicodeEscape = '\' "u" hexDigit hexDigit hexDigit hexDigit unicodeLongEscape = '\' "U" ( "000" hexDigit hexDigit hexDigit hexDigit hexDigit | "0010" hexDigit hexDigit hexDigit hexDigit
```

### EmptyStatement

### Constant

```gdscript3
constant = fullIdent | ( [ "-" | "+" ] intLit ) | ( [ "-" | "+" ] floatLit ) | strLit | boolLit | MessageValue
```

`MessageValue` is defined in the [Text Format Language Specification](https://protobuf.dev/reference/protobuf/textformat-spec#fields).

## Syntax

The syntax statement is used to define the protobuf version.

```fallback
syntax = "syntax" "=" ("'" "proto3" "'" | '"' "proto3" '"') ";"
```

Example:

## Import Statement

The import statement is used to import another .proto’s definitions.

```fallback
import = "import" [ "weak" | "public" ] strLit ";"
```

Example:

```proto
import public "other.proto";
```

## Package

The package specifier can be used to prevent name clashes between protocol message types.

```go
package = "package" fullIdent ";"
```

Example:

## Option

Options can be used in proto files, messages, enums and services. An option can be a protobuf defined option or a custom option. For more information, see [Options](https://protobuf.dev/programming-guides/proto3#options) in the language guide.

```gdscript3
option = "option" optionName "=" constant ";" optionName = ( ident | bracedFullIdent ) { "." ( ident | bracedFullIdent ) } bracedFullIdent = "(" ["."] fullIdent ")" optionNamePart = { ident | "(" ["."] fullIdent ")" }
```

Example:

```proto
option java_package = "com.example.foo";
```

## Fields

Fields are the basic elements of a protocol buffer message. Fields can be normal fields, oneof fields, or map fields. A field has a type and field number.

```gdscript3
type = "double" | "float" | "int32" | "int64" | "uint32" | "uint64" | "sint32" | "sint64" | "fixed32" | "fixed64" | "sfixed32" | "sfixed64" | "bool" | "string" | "bytes" | messageType | enumType fieldNumber = intLit;
```

### Normal Field

Each field has type, name and field number. It may have field options.

```gdscript3
field = [ "repeated" | "optional" ] type fieldName "=" fieldNumber [ "[" fieldOptions "]" ] ";" fieldOptions = fieldOption { "," fieldOption } fieldOption = optionName "=" constant
```

Examples:

```proto
foo.Bar nested_message = 2; repeated int32 samples = 4 [packed=true];
```

### Oneof and Oneof Field

A oneof consists of oneof fields and a oneof name.

```fallback
oneof = "oneof" oneofName "{" { option | oneofField } "}" oneofField = type fieldName "=" fieldNumber [ "[" fieldOptions "]" ] ";"
```

Example:

```proto
oneof foo { string name = 4; SubMessage sub_message = 9; }
```

### Map Field

A map field has a key type, value type, name, and field number. The key type can be any integral or string type.

```fallback
mapField = "map" "<" keyType "," type ">" mapName "=" fieldNumber [ "[" fieldOptions "]" ] ";" keyType = "int32" | "int64" | "uint32" | "uint64" | "sint32" | "sint64" | "fixed32" | "fixed64" | "sfixed32" | "sfixed64" | "bool" | "string"
```

Example:

```proto
map<string, Project> projects = 3;
```

## Reserved

Reserved statements declare a range of field numbers or field names that cannot be used in this message.

```fallback
reserved = "reserved" ( ranges | strFieldNames ) ";" ranges = range { "," range } range = intLit [ "to" ( intLit | "max" ) ] strFieldNames = strFieldName { "," strFieldName } strFieldName = "'" fieldName "'" | '"' fieldName '"'
```

Examples:

```proto
reserved 2, 15, 9 to 11; reserved "foo", "bar";
```

## Top Level Definitions

### Enum Definition

The enum definition consists of a name and an enum body. The enum body can have options, enum fields, and reserved statements.

```gdscript3
enum = "enum" enumName enumBody enumBody = "{" { option | enumField | emptyStatement | reserved } "}" enumField = ident "=" [ "-" ] intLit [ "[" enumValueOption { "," enumValueOption } "]" ]";" enumValueOption = optionName "=" constant
```

Example:

```proto
enum EnumAllowingAlias { option allow_alias = true; EAA_UNSPECIFIED = 0; EAA_STARTED = 1; EAA_RUNNING = 2 [(custom_option) = "hello world"]; }
```

### Message Definition

A message consists of a message name and a message body. The message body can have fields, nested enum definitions, nested message definitions, options, oneofs, map fields, and reserved statements. A message cannot contain two fields with the same name in the same message schema.

```gdscript3
message = "message" messageName messageBody messageBody = "{" { field | enum | message | option | oneof | mapField | reserved | emptyStatement } "}"
```

Example:

```proto
message Outer { option (my_option).a = true; message Inner { // Level 2 int64 ival = 1; } map<int32, string> my_map = 2; }
```

None of the entities declared inside a message may have conflicting names. All of the following are prohibited:

```gdscript3
message MyMessage { optional string foo = 1; message foo {} } message MyMessage { optional string foo = 1; oneof foo { string bar = 2; } } message MyMessage { optional string foo = 1; enum E { foo = 0; } }
```

### Service Definition

```fallback
service = "service" serviceName "{" { option | rpc | emptyStatement } "}" rpc = "rpc" rpcName "(" [ "stream" ] messageType ")" "returns" "(" [ "stream" ] messageType ")" (( "{" {option | emptyStatement } "}" ) | ";")
```

Example:

```proto
service SearchService { rpc Search (SearchRequest) returns (SearchResponse); }
```

## Proto File

```gdscript3
proto = [syntax] { import | package | option | topLevelDef | emptyStatement } topLevelDef = message | enum | service
```

An example .proto file:

```proto
syntax = "proto3"; import public "other.proto"; option java_package = "com.example.foo"; enum EnumAllowingAlias { option allow_alias = true; EAA_UNSPECIFIED = 0; EAA_STARTED = 1; EAA_RUNNING = 1; EAA_FINISHED = 2 [(custom_option) = "hello world"]; } message Outer { option (my_option).a = true; message Inner { // Level 2 int64 ival = 1; } repeated Inner inner_message = 2; EnumAllowingAlias enum_field = 3; map<int32, string> my_map = 4; }
```