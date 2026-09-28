// WinterSnow blows its drift away on route changes; the backdrop has one route.
export function useLocation() {
  return { pathname: '/', search: '', hash: '' } as never;
}
