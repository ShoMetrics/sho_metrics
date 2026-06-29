export function throwPatchTargetMismatch(message: string): never {
    throw new Error(message);
}

export function assertNever(value: never): never {
    throw new Error(`Unexpected stored metric target reading case: ${JSON.stringify(value)}`);
}
