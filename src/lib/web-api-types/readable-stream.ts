import { CoreLibTypeId } from "../../dif/core.ts";
import { type CustomReferenceMetadata } from "../../dif/dif-handler.ts";
import type { TypeBindingDefinition } from "../../dif/type-registry.ts";

const readableStreamControllers = new WeakMap<ReadableStream<unknown>, ReadableStreamDefaultController<unknown>>();

export const readableStreamTypeBinding: TypeBindingDefinition<ReadableStream<unknown>> = {
    coreLibTypeId: CoreLibTypeId.Receiver,
    jsClass: ReadableStream,
    bind(target) {
        const metadata: CustomReferenceMetadata = {};

        const readableStream = new ReadableStream({
            start(controller) {
                readableStreamControllers.set(target, controller);
            }
        });
        readableStream.new = true;
        target.new = false;

        return {
            value: readableStream,
            metadata,
        };
    },
    handleAppend(target, value) {
        const originalTarget = this.difHandler.getOriginalValueFromProxy(target)!;

        const controller = readableStreamControllers.get(originalTarget);
        if (controller) {
            controller.enqueue(value);
        } else {
            console.log("append", target);
            throw new Error("ReadableStream controller is not available.");
        }
    },
};