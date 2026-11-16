import { CoreLibTypeId } from "../../dif/core.ts";
import type { CustomReferenceMetadata } from "../../dif/dif-handler.ts";
import type { TypeBindingDefinition } from "../../dif/type-registry.ts";

const readableStreamControllers = new WeakMap<ReadableStream<unknown>, ReadableStreamDefaultController<unknown>>();

export const readableStreamTypeBinding: TypeBindingDefinition<ReadableStream<unknown>> = {
    coreLibTypeId: CoreLibTypeId.Receiver,
    jsClass: ReadableStream as unknown as new (...args: unknown[]) => ReadableStream<unknown>,
    bind(target) {
        const metadata: CustomReferenceMetadata = {};

        const readableStream = new ReadableStream({
            start(controller) {
                readableStreamControllers.set(target, controller);
            },
        });

        return {
            value: readableStream,
            metadata,
        };
    },
    handleAppend(target, value) {
        const originalTarget = this.difHandler.getOriginalValueFromProxy(target)!;

        const controller = readableStreamControllers.get(originalTarget);
        if (controller) {
            try {
                controller.enqueue(value);
            } catch (_e) {
                // TODO: what to do in this case? cleanup?
            }
        } else {
            throw new Error("ReadableStream controller is not available.");
        }
    },
};
