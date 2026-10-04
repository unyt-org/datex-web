// @generated file -- do not edit
// deno-lint-ignore-file
// deno-fmt-ignore-file

import type { Tagged } from "../../../../../lib/mod.ts";

export type TLSMode = Tagged<"HandledExternally"> | Tagged<"WithCertificate", {
    private_key: number[];
    certificate: number[];
}>;

export type AcceptAddress = {
    address: string;
    tls_mode: TLSMode | null;
};