declare module "mime-types" {
    /**
     * Lookup the MIME type for a file path/extension.
     */
    function lookup(path: string): string | false;
}
