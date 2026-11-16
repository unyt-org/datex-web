import type { Runtime } from "datex/runtime/mod.ts";
import type { DIFTransceiverId, DIFUpdate, DIFUpdateData } from "datex/dif/types/update.ts";
import type { PointerAddress } from "datex/shared-container/mod.ts";

export const FAKE_TRANSCEIVER_ID = 42 as DIFTransceiverId;
export function performFakeRemoteUpdate(runtime: Runtime, address: PointerAddress, data: DIFUpdateData) {
    return performFakeRemoteUpdateWithSourceId(runtime, address, data, FAKE_TRANSCEIVER_ID);
}
export function performFakeRemoteUpdateWithSourceId(
    runtime: Runtime,
    address: PointerAddress,
    data: DIFUpdateData,
    sourceId: DIFTransceiverId,
) {
    return runtime.dif._handle.update(address, [sourceId, ...data] satisfies DIFUpdate);
}
