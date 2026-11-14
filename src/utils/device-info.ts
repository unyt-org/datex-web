/// Returns the browser name and version
async function getBrowser() {
    if (navigator.userAgentData) {
        const { fullVersionList } =
            await navigator.userAgentData.getHighEntropyValues(["fullVersionList"]);
        const brand = fullVersionList.find(b => !/Not.?A.?Brand|Chromium/i.test(b.brand))
            ?? fullVersionList.find(b => b.brand === "Chromium");
        if (brand) return { name: brand.brand, version: brand.version };
    }

    const ua = navigator.userAgent;
    const patterns = [
        ["Edge", /Edg\/([\d.]+)/],
        ["Opera", /OPR\/([\d.]+)/],
        ["Firefox", /Firefox\/([\d.]+)/],
        ["Chrome", /Chrome\/([\d.]+)/],
        ["Safari", /Version\/([\d.]+).*Safari/],
    ];
    for (const [name, re] of patterns) {
        const m = ua.match(re);
        if (m) return { name, version: m[1] };
    }
    return { name: "unknown", version: "unknown" };
}

export async function getDeviceTypeAndVersions(): Promise<{
    deviceType: string;
    versions: { [key: string]: string };
}> {
    const browserInfo = await getBrowser();
    const platformName = navigator.platform || "unknown platform";
    const platformVersion = navigator.userAgent.match(/(Windows NT|Mac OS X|Linux|Android|iOS)[^;)]*/)?.[0] || "unknown";
    return {
        deviceType: `Web Browser (${browserInfo.name} / ${platformName})`,
        versions: {
            'browser': `${browserInfo.name} ${browserInfo.version}`,
            'os': platformVersion,
        },
    };
}