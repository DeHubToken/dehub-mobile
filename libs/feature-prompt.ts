/** Keep the existing request row contract while accepting one free-form prompt. */
export function featurePromptFields(prompt: string, title = '', device = '') {
  const description = prompt.trim();
  const heading = (title.trim() || description.split(/\r?\n/)[0]).slice(0, 100)
    .replace(/[\uD800-\uDBFF]$/, '');
  return {
    title: heading,
    description: device.trim() ? `${description}\n\nDevice & OS: ${device.trim()}` : description,
  };
}
