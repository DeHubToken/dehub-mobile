// Credential responses stay in the parent process and never enter job logs.
let input = "";
for await (const chunk of process.stdin) input += chunk;
try {
  if (!process.env.EXPO_TOKEN) throw new Error("missing token");
  const response = await fetch("https://api.expo.dev/graphql", {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.EXPO_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: input,
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    process.stderr.write(`Managed profile lookup returned HTTP ${response.status}\n`);
    process.exitCode = 1;
  } else {
    const result = await response.json();
    if (result.errors || !result.data) throw new Error("query failed");
    process.stdout.write(JSON.stringify(result.data));
  }
} catch {
  process.stderr.write("Managed profile lookup failed; no credential response is logged\n");
  process.exitCode = 1;
}
