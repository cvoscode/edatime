import type { DatasetMetadata } from '../../types/api.js';
import type { ProfileRow } from '../../types/store.js';

/** Upload-only preview/profile data. Never publishes the active dataset. */
export const uploadProfile = {
    metadata: null as DatasetMetadata | null,
    columnProfiles: [] as ProfileRow[],
};

export function setColumnProfiles(profiles: ProfileRow[]): void {
    uploadProfile.columnProfiles = profiles.map(profile => ({ ...profile }));
}
