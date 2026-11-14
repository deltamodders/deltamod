import type { Readable } from "stream";

import axios from "axios";

interface AxiosGetResponseExt {
    content_length: number | null;
    on_data: (f: (chunk: Buffer) => void) => void;
}

type AxiosGetSteamResponse = axios.AxiosResponse<Readable, {}, {}, any>;

type GetResponseExt = AxiosGetSteamResponse & AxiosGetResponseExt;

export async function getSteamSized(url: string): Promise<GetResponseExt> {
    const response = await axios.get(url, {
        responseType: "stream",
        maxRedirects: 10,
    });
    const content_len_val = response.headers["content-length"];
    return {
        content_length: content_len_val
            ? parseInt(content_len_val.toString(), 10)
            : null,
        on_data: (f) => response.data.on("data", f),
        ...response,
    };
}
