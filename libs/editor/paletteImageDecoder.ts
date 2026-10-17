type Decoder = (source: string, signal: AbortSignal) => Promise<string[]>;
const decoders = new Map<string, Decoder>();
export function registerPaletteImageDecoder(projectId: string, decode: Decoder): () => void {
  decoders.set(projectId, decode); return () => { if (decoders.get(projectId) === decode) decoders.delete(projectId); };
}
export async function decodePaletteImage(projectId: string, source: string, signal: AbortSignal): Promise<string[]> {
  const decoder = decoders.get(projectId); if (!decoder) throw new Error("The design canvas is not ready");
  const colours = await decoder(source, signal);
  if (signal.aborted || decoders.get(projectId) !== decoder) throw new Error("Palette extraction cancelled");
  if (!Array.isArray(colours) || !colours.length || colours.length > 8 || colours.some(colour => !/^#[a-f0-9]{6}$/i.test(colour))) throw new Error("Could not extract page colours");
  return colours;
}
