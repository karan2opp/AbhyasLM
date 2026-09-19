import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
// Registers \ce{...} (chemical formulas and equations) on the KaTeX instance rehype-katex renders with.
import "katex/contrib/mhchem";

// Question text is markdown with LaTeX maths: $inline$ and $$display$$.
export const MATH_REMARK_PLUGINS = [remarkGfm, remarkMath];
export const MATH_REHYPE_PLUGINS = [rehypeKatex];

/** True when text contains something markdown or maths rendering would change. */
export function hasMarkup(text: string): boolean {
  return /\$[^$]+\$|`[^`]+`|\*\*[^*]+\*\*/.test(text);
}
