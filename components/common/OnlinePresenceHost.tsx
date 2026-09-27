/**
 * Renders nothing. Holds the "show when I'm online" presence channel for the
 * whole session — see hooks/useOnlinePresence. A component rather than a call
 * in a provider so its re-renders stay its own, like NewMemberRegistrar.
 */
import { useOnlinePresence } from "../../hooks/useOnlinePresence";

export default function OnlinePresenceHost() {
  useOnlinePresence();
  return null;
}
