/**
 * Retrieves the browser name and version from the user agent string or navigator.userAgentData.
 * @returns An object containing the browser name and version
 */

declare global {
    interface Navigator {
        userAgentData?: {
            getHighEntropyValues(hints: string[]): Promise<{ fullVersionList: { brand: string; version: string }[] }>;
        };
    }
}

async function getBrowser(): Promise<{ name: string; version: string }> {
    if (navigator.userAgentData) {
        const { fullVersionList } = await navigator.userAgentData.getHighEntropyValues(["fullVersionList"]);
        const brand = fullVersionList.find((b) => !/Not.?A.?Brand|Chromium/i.test(b.brand)) ??
            fullVersionList.find((b) => b.brand === "Chromium");
        if (brand) return { name: brand.brand, version: brand.version };
    }

    const ua = navigator.userAgent;
    const patterns = [
        ["Edge", /Edg\/([\d.]+)/],
        ["Opera", /OPR\/([\d.]+)/],
        ["Firefox", /Firefox\/([\d.]+)/],
        ["Chrome", /Chrome\/([\d.]+)/],
        ["Safari", /Version\/([\d.]+).*Safari/],
    ] as [string, RegExp][];
    for (const [name, re] of patterns) {
        const m = ua.match(re);
        if (m) return { name, version: m[1] };
    }
    return { name: "unknown", version: "unknown" };
}

/**
 * Retrieves the device type and versions of the browser and operating system.
 * @returns An object containing the device type and versions of the browser and operating system.
 */
export async function getDeviceTypeAndVersions(): Promise<{
    deviceType: string;
    versions: Record<string, string>;
}> {
    const browserInfo = await getBrowser();
    const platformName = navigator.platform || "unknown platform";
    const platformVersion = navigator.userAgent.match(/(Windows NT|Mac OS X|Linux|Android|iOS)[^;)]*/)?.[0] ||
        "unknown";
    return {
        deviceType: `Web Browser (${browserInfo.name} / ${platformName})`,
        versions: {
            "browser": `${browserInfo.name} ${browserInfo.version}`,
            "os": platformVersion,
        },
    };
}
