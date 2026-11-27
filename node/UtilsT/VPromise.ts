export function vpromise(
    f: (resolve: () => void, reject: (reason?: any) => void) => void,
): Promise<void> {
    return new Promise(f);
}
