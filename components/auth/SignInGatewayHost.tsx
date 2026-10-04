import React from 'react';
export default function SignInGatewayHost(props: { visible: boolean; onClose: () => void }) {
  if (!props.visible) return null;
  const Body = require('./SignInGatewayModal').default;
  return <Body {...props} />;
}
