/**
 * DHB sales are paused. Buy screens keep showing prices but report 0
 * available, and every way of starting a purchase is closed. The backend
 * refuses new purchases too (DHB_SALES_PAUSED), so this is only the face of it.
 */
export const DHB_SALES_PAUSED = true;
export const DHB_SALES_PAUSED_MESSAGE = 'DHB sales are paused. Nothing is available to buy right now.';
