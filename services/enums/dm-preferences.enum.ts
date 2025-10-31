export enum DmDisableStatus {
  ACTIVE_ALL = 'ACTIVE_ALL',
  ALL = 'ALL',
  NEW_DM = 'NEW_DM',
}

export enum DmAction {
  Enable = 'enable',
  Disable = 'disable',
}

export type DmPreferences = {
  disables?: DmDisableStatus[];
  minTipDhb?: number;
};
