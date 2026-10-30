import {unreachable} from "../../utils/exceptions.ts";
import type {DIFClassification, DIFCoreValue, DIFSharedValue, DIFValue, DIFValueContainer} from "../types/value.ts";
import {PointerAddress} from "../../shared-container/mod.ts";
import {JsLibTypeAddress} from "../js-lib.ts";

export function tryGetClassification(value: DIFValue): DIFClassification|null {
    if (typeof value === "object" && value !== null && '_' in value && value?._ === "c") {
        if (!('c' in value)) {
            unreachable("DIFValue with _='c' must have a 'c' property");
        }
        return value.c ?? null;
    }
    return null;
}

export function hasImplClassification(value: DIFValue, implTypeAddress: PointerAddress): boolean {
    const classification = tryGetClassification(value);
    if (!classification) {
        return false;
    }
    return classificationHasImpl(classification, implTypeAddress);
}

export function classificationHasImpl(classification: DIFClassification, implTypeAddress: PointerAddress): boolean {
    const [_, implTypes] = classification;
    return implTypes?.includes(implTypeAddress) ?? false;
}


export function createDIFValueWithClassification(value: DIFCoreValue, classification: DIFClassification): DIFValue {
    return {
        _: 'c',
        c: classification,
        v: value,
    }
}

export function createDIFValueWithImplClassification(value: DIFCoreValue, implTypeAddresses: PointerAddress[]): DIFValue {
    return createDIFValueWithClassification(value, [null, implTypeAddresses]);
}

export function createDIFValueWithEntityClassification(value: DIFCoreValue, entityTypeAddress: PointerAddress): DIFValue {
    return createDIFValueWithClassification(value, [entityTypeAddress, []]);
}

export function createDIFValueWithTag(value: DIFCoreValue, tag: string, is_empty: true|null = null): DIFValue {
    return {
        _: 't',
        t: is_empty ? [tag, is_empty] : [tag],
        v: value,
    }
}

export function isSharedValueContainer(value: DIFValueContainer): value is DIFSharedValue {
    return typeof value === "object" && value !== null && '_' in value && value._ !== "t" && value._ !== "c";
}