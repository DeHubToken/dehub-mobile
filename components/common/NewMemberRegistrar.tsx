/**
 * New Member Registrar (mobile)
 * =============================
 * Renders nothing. Puts the signed-in account on the new-members roster once
 * per app launch. Twin of web's `components/app/NewMemberRegistrar.tsx`.
 *
 * A component rather than a call in AuthContext so a failure here can never
 * touch a sign-in, and so its auth subscription re-renders nothing but itself.
 */
import { useRegisterNewMember } from "../../hooks/useNewMembers";

export default function NewMemberRegistrar() {
  useRegisterNewMember();
  return null;
}
