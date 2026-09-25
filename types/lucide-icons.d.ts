// lucide-react-native ships types only for its root entry. Per-icon files are
// imported directly (see components/ui/iconRegistry.ts) so Metro bundles just
// those icons instead of the whole set.
declare module "lucide-react-native/dist/esm/icons/*" {
  import type { LucideIcon } from "lucide-react-native";
  const Icon: LucideIcon;
  export default Icon;
}
