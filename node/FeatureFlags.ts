import { PACKAGE_JSON } from "./Paths";

const pkg_info: { featureFlags: string[]; } = require(PACKAGE_JSON);

export function isFeatureEnabled(feature: string): boolean {
    return pkg_info.featureFlags.findIndex(x => x.toLowerCase().trim() == feature.toLowerCase().trim()) >= 0;
}
