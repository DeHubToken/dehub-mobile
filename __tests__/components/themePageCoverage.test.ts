import fs from 'fs';
import path from 'path';

it.each(['PromptScreen', 'FeatureRequestsScreen', 'BuilderScreen', 'AppsScreen', 'ArcadeScreen', 'ArcadeChessOnlineScreen', 'LiveChatScreen'])('%s lets the active theme own the page background', (screen) => {
  const source = fs.readFileSync(path.resolve(__dirname, `../../screens/${screen}.tsx`), 'utf8');
  expect(source).toMatch(/<View className="(?:flex-1 )?bg-theme-background"(?: style=\{|>)/);
  expect(source).not.toMatch(/(?:root|screen):\s*\{[^}]*backgroundColor:\s*["']#000/);
});
