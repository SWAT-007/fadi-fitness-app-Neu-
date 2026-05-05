/**
 * recipeParser.ts
 * Parses German-language recipe PDFs into structured data.
 *
 * Three book formats:
 *  A) FastFitnessKitchen  — macros→[NN]→PREV_NAME → CURR_NAME → ZUTATEN: → [ings] → ZUBEREITUNG: → [steps]
 *  B) Kindheitsträume     — "NN. TITLE" → description → ZUBEREITUNG → [steps] → NPortionenZUTATEN → [ings]
 *  C) Balance & Burn      — TITLE → N Portion → "NNN kcal - Xg KH, Yg Fett, Zg Eiweiß" → [ings] → [steps]
 */

import fs from 'fs'
import path from 'path'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ParsedIngredient {
  name: string
  amount: string
}

export interface ParsedRecipe {
  name: string
  ingredients: ParsedIngredient[]
  instructions: string
  total_calories: number | null
  protein_g: number | null
  carbs_g: number | null
  fat_g: number | null
  servings: number | null
  source_pdf: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseNum(s: string): number | null {
  const n = parseFloat(s.replace(',', '.').replace(/\s+/g, ''))
  return isNaN(n) ? null : n
}

function cleanText(raw: string): string {
  return raw
    .replace(/\r\n/g, '\n').replace(/\r/g, '\n')
    .replace(/kamilla\.suele@gmail\.com/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// ─── Macro extraction ─────────────────────────────────────────────────────────

interface Macros { calories: number | null; protein: number | null; carbs: number | null; fat: number | null }

function extractMacros(block: string): Macros {
  // Format A: KALORIEN\nPROTEINKOHLENHYDRATEFETT\n556\n30G76G12G
  const fkM = block.match(/KALORIEN\s*\nPROTEIN\s*KOHLENHYDRATE\s*FETT\s*\n([\d,.]+)\s*\n([\d,.]+)G([\d,.]+)G([\d,.]+)G/i)
  if (fkM) return { calories: parseNum(fkM[1]), protein: parseNum(fkM[2]), carbs: parseNum(fkM[3]), fat: parseNum(fkM[4]) }

  // Format B: Kalorien\nEiweiß\nKohlenhydrate\nFett\n171, 5\n12,3 g\n18,5 g\n5,2 g
  const ktM = block.match(/Kalorien\s*\nEiwei[ßs]\s*\nKohlenhydrate\s*\nFett\s*\n([\d, .]+)\n([\d, .]+)\s*g?\n([\d, .]+)\s*g?\n([\d, .]+)\s*g?/i)
  if (ktM) return { calories: parseNum(ktM[1]), protein: parseNum(ktM[2]), carbs: parseNum(ktM[3]), fat: parseNum(ktM[4]) }

  // Format C: 400 kcal - 60g Kohlenhydrate, 16g Fett, 12g Eiweiss
  const bbM = block.match(/([\d,.]+)\s*kcal\s*[-–]\s*([\d,.]+)g\s*Kohlenhydrate\s*,\s*([\d,.]+)g\s*Fett\s*,\s*([\d,.]+)g\s*Eiwei/i)
  if (bbM) return { calories: parseNum(bbM[1]), carbs: parseNum(bbM[2]), fat: parseNum(bbM[3]), protein: parseNum(bbM[4]) }

  return { calories: null, protein: null, carbs: null, fat: null }
}

// ─── Ingredient parsing ───────────────────────────────────────────────────────

function parseIngredientLine(raw: string): ParsedIngredient | null {
  const t = raw.trim().replace(/^[-•*–]\s*/, '')
  if (t.length < 3 || t.length > 90) return null

  // "N[/N] [unit] [(annotation)] name"
  const m = t.match(
    /^([\d/., ]{1,10})\s*(g|kg|ml|l|el|tl|stk\.?|pck\.?|msp\.?|bund|dose[n]?|becher|tasse[n]?|scheibe[n]?|faust|handschale|stück)\.?\s*(?:\([^)]*\))?\s+(.{2,70})$/i,
  )
  if (!m) return null
  const name = m[3].trim()
  if (!name || /^\d+$/.test(name) || name.length < 2) return null
  return { amount: `${m[1].trim()} ${m[2]}`.trim(), name }
}

function parsePipeList(line: string): ParsedIngredient[] {
  return line.split('|').map(s => s.trim()).filter(s => s.length > 1).map(seg => {
    const ing = parseIngredientLine(seg)
    return ing ?? { amount: '', name: seg.slice(0, 80) }
  })
}

// ─── Format A ─────────────────────────────────────────────────────────────────
//
// Each recipe block:
//  …PREV content…
//  NN
//  [PREV_RECIPE_NAME — just finished]
//  [blank]
//  CURR_RECIPE_NAME     ← 1-2 lines, ALL CAPS or Title Case
//  ZUTATEN:
//  ZUBEREITUNG:
//  250g Reis | 200g Bohnen | …    ← ingredients (pipe-separated OR line-by-line)
//  1. Step …
//  N Portionen
//  NÄHRWERTE PRO PORTION
//  KALORIEN
//  PROTEINKOHLENHYDRATEFETT
//  556
//  30G76G12G

// Lines to ignore when searching backward for a title
const SKIP_LINES = /^(ZUTATEN|ZUBEREITUNG|NÄHRWERTE|KALORIEN|PROTEIN|FETT|KOHLENHYDRATE|EMPFEHLUNG|PRE-WORKOUT|POST-WORKOUT|FRÜHSTÜCK|HAUPTMAHLZEIT|SNACK|SINCE)/i

// Patterns that are definitely NOT recipe titles
const NOISE_LINE = /^(\d+$|\d+G\d+G\d+G$|\d+[\d,.]*G$|\d+\s*MINUTEN|PROTEIN.*HYDRATE|NÄHRWERTE|KALORIEN|EMPFEHLUNG|PRE-WORKOUT|POST-WORKOUT|FRÜHSTÜCK|HAUPTMAHLZEIT|SINCE|EDITORIAL|FAST KITCHEN|REZEPTE IN|ZUBEREITUNGSZEIT)/i

function titleFromBefore(textBefore: string): string {
  // Walk backward through lines collecting the title "cluster".
  // Rules:
  //   • Skip trailing empty lines at the very end (artifact of the window boundary)
  //   • Once we've started collecting, stop at the first blank line (blank = cluster separator)
  //   • Skip lone numbers (recipe/chapter numbers like "03", "1")
  //   • Stop at noise lines (macros, section headers, etc.)
  //   • Collect at most 3 title lines

  const lines = textBefore.split('\n')
  const cluster: string[] = []
  let collecting = false   // true once we've seen the first non-empty line

  for (let i = lines.length - 1; i >= 0; i--) {
    const l = lines[i].trim()

    if (!collecting) {
      // Skip trailing empty lines
      if (l === '') continue
      collecting = true
    } else {
      // Inner blank line → title cluster ends
      if (l === '') break
    }

    if (/^\d+$/.test(l)) continue        // lone number (recipe #, page #) → skip
    if (NOISE_LINE.test(l)) break        // section header / macro noise → stop

    const words = l.split(/\s+/)
    const allCaps = l === l.toUpperCase() && /[A-ZÄÖÜ]{2}/.test(l)
    const titleCase = words.filter(w => w.length > 2 && /^[A-ZÄÖÜ]/.test(w)).length >= Math.ceil(words.length * 0.5)
    if ((allCaps || titleCase) && words.length >= 1 && l.length <= 70) {
      cluster.unshift(l)
      if (cluster.length >= 3) break
    } else {
      break  // non-title-like line → stop
    }
  }

  return cluster.join(' ').trim()
}

function parseAllFormatA(text: string, source: string): ParsedRecipe[] {
  const recipes: ParsedRecipe[] = []
  // Use toLowerCase() — toUpperCase() expands ß→SS, shifting positions
  const lower = text.toLowerCase()

  // Collect all ZUTATEN: positions
  const positions: number[] = []
  let pos = 0
  while ((pos = lower.indexOf('zutaten:', pos)) !== -1) { positions.push(pos); pos++ }

  for (let i = 0; i < positions.length; i++) {
    const start = positions[i]
    const end = i + 1 < positions.length ? positions[i + 1] : text.length
    const block = text.slice(start, end)
    const blockUpper = block.toUpperCase()

    // Title from the 300 chars immediately before this ZUTATEN:
    const title = titleFromBefore(text.slice(Math.max(0, start - 300), start))
    if (!title) continue

    // Ingredients: ZUTATEN: and ZUBEREITUNG: appear on adjacent lines; real content is after both
    const blockLower = block.toLowerCase()
    const zubIdx = blockLower.indexOf('zubereitung:')
    const ingSection = block.slice(8, zubIdx >= 0 ? zubIdx : 300)

    const ingredients: ParsedIngredient[] = []
    for (const line of ingSection.split('\n')) {
      const t = line.trim()
      if (!t || /^zubereitung/i.test(t)) continue
      if (t.includes('|')) ingredients.push(...parsePipeList(t))
      else {
        const ing = parseIngredientLine(t)
        if (ing) ingredients.push(ing)
        else if (t.length > 2 && t.length < 80) ingredients.push({ amount: '', name: t })
      }
    }

    // Instructions
    let instructions = ''
    if (zubIdx >= 0) {
      const nahrIdx = blockLower.indexOf('nährwerte')
      const instrEnd = nahrIdx > zubIdx ? nahrIdx : block.length
      instructions = block.slice(zubIdx + 12, instrEnd).trim()
    }

    const macros = extractMacros(block)
    const servM = block.match(/(\d+)\s*Portionen?/i)

    recipes.push({
      name: title,
      ingredients,
      instructions,
      total_calories: macros.calories,
      protein_g: macros.protein,
      carbs_g: macros.carbs,
      fat_g: macros.fat,
      servings: servM ? parseInt(servM[1], 10) : null,
      source_pdf: source,
    })
  }

  return recipes
}

// ─── Format B ─────────────────────────────────────────────────────────────────

function parseAllFormatB(text: string, source: string): ParsedRecipe[] {
  const recipes: ParsedRecipe[] = []

  // Numbered recipe titles: "01.  RECIPE NAME" (2-digit prefix)
  const titleRe = /^(\d{2})\.\s{1,4}([A-ZÄÖÜ][^\n]{2,60})/gm
  const matches: Array<{ index: number; name: string }> = []
  let m: RegExpExecArray | null

  // eslint-disable-next-line no-cond-assign
  while ((m = titleRe.exec(text)) !== null) {
    // Strip trailing page number (e.g. "RECIPE NAME  28")
    const name = m[2].replace(/\s+\d{1,3}\s*$/, '').trim()
    matches.push({ index: m.index, name })
  }

  for (let i = 0; i < matches.length; i++) {
    const { index, name } = matches[i]
    const end = i + 1 < matches.length ? matches[i + 1].index : text.length
    const block = text.slice(index, end)
    // Use toLowerCase() — toUpperCase() expands ß→SS, shifting positions
    const blockLower = block.toLowerCase()

    // Skip pure TOC entries (very short or no cooking keywords)
    if (block.length < 150) continue
    if (!/zubereitung|zutat|kalorien|eiwei/.test(blockLower)) continue

    // Instructions: text between ZUBEREITUNG and ZUTATEN
    const zubIdx = blockLower.indexOf('zubereitung')
    const zutIdx = blockLower.indexOf('zutat', zubIdx > 0 ? zubIdx : 0)
    let instructions = ''
    if (zubIdx >= 0) {
      const instrEnd = zutIdx > zubIdx ? zutIdx : block.length
      instructions = block.slice(zubIdx + 11, instrEnd).trim()
    }

    // Ingredients: structured amount-unit-name lines anywhere in the block
    const ingredients: ParsedIngredient[] = []
    for (const line of block.split('\n')) {
      const ing = parseIngredientLine(line)
      if (ing) ingredients.push(ing)
    }

    if (ingredients.length === 0 && instructions.length < 50) continue

    const macros = extractMacros(block)
    const servM = block.match(/(\d+)\s*(?:Portionen?|Stück|Frühlingsrollen|Cookies|Balls)/i)

    recipes.push({
      name,
      ingredients,
      instructions,
      total_calories: macros.calories,
      protein_g: macros.protein,
      carbs_g: macros.carbs,
      fat_g: macros.fat,
      servings: servM ? parseInt(servM[1], 10) : null,
      source_pdf: source,
    })
  }

  return recipes
}

// ─── Format C ─────────────────────────────────────────────────────────────────

function parseAllFormatC(text: string, source: string): ParsedRecipe[] {
  const recipes: ParsedRecipe[] = []

  // Anchor: the macro-summary line that reliably marks a recipe
  const macroPat = /([\d,.]+)\s*kcal\s*[-–]\s*[\d,.]+g\s*Kohlenhydrate/gi
  const positions: number[] = []
  let rm: RegExpExecArray | null

  // eslint-disable-next-line no-cond-assign
  while ((rm = macroPat.exec(text)) !== null) { positions.push(rm.index) }

  for (let i = 0; i < positions.length; i++) {
    const macroPos = positions[i]
    const blockEnd = i + 1 < positions.length ? positions[i + 1] : text.length

    // Look backward for the recipe title (up to 400 chars before macro line)
    const before = text.slice(Math.max(0, macroPos - 400), macroPos)
    const beforeLines = before.split('\n').map(l => l.trim())

    // Strategy: find the "N Portion" / "N Minuten" line; title is the line just before it.
    // Fallback: last non-noise line.
    let title = ''
    const portionIdx = beforeLines.findLastIndex(l => /^\d+\s*Portion/i.test(l))
    if (portionIdx > 0) {
      // Look immediately before the portion line for the title
      for (let j = portionIdx - 1; j >= 0; j--) {
        const l = beforeLines[j]
        if (!l || l.length < 3 || l.length > 70) continue
        if (/^\d+$/.test(l) || /^Makros$/i.test(l)) continue
        title = l
        break
      }
    }
    // Fallback: walk backward from end
    if (!title) {
      for (let j = beforeLines.length - 1; j >= 0; j--) {
        const l = beforeLines[j]
        if (!l || l.length < 3 || l.length > 70) continue
        if (/^\d+$/.test(l) || /^(\d+\s*Portion|\d+\s*Minute|Makros$)/i.test(l)) continue
        // Must start with uppercase and not be a description sentence
        if (/^[A-ZÄÖÜ]/.test(l) && !l.endsWith('.') && !l.endsWith(',')) { title = l; break }
      }
    }
    if (!title) continue

    const block = text.slice(macroPos, blockEnd)
    // Use toLowerCase() — toUpperCase() expands ß→SS, shifting positions
    const blockLower = block.toLowerCase()
    const macros = extractMacros(text.slice(macroPos, macroPos + 200))

    // Ingredients: scan both before-block and after-macro block
    const ingredients: ParsedIngredient[] = []
    const zutIdx = blockLower.indexOf('zutaten')
    const ingArea = zutIdx >= 0 ? block.slice(0, zutIdx) : block.slice(0, 600)
    for (const line of (before + '\n' + ingArea).split('\n')) {
      const ing = parseIngredientLine(line)
      if (ing && !ingredients.some(x => x.name === ing.name)) {
        ingredients.push(ing)
      }
    }

    // Instructions
    let instructions = ''
    const zubIdx = blockLower.indexOf('zubereitung')
    if (zubIdx >= 0) {
      const instrEnd = zutIdx > zubIdx ? zutIdx : block.length
      instructions = block.slice(zubIdx + 11, instrEnd).trim()
    }

    const servM = block.match(/(\d+)\s*Portion/i)

    recipes.push({
      name: title,
      ingredients,
      instructions,
      total_calories: macros.calories,
      protein_g: macros.protein,
      carbs_g: macros.carbs,
      fat_g: macros.fat,
      servings: servM ? parseInt(servM[1], 10) : null,
      source_pdf: source,
    })
  }

  return recipes
}

// ─── Format detection + dispatch ─────────────────────────────────────────────

function detectFormat(text: string): 'A' | 'B' | 'C' {
  if (/NÄHRWERTE PRO PORTION/i.test(text)) return 'A'
  if (/Kalorien\s*\nEiwei/i.test(text)) return 'B'
  return 'C'
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function parsePdfBuffer(buffer: Buffer, sourcePdf: string): Promise<ParsedRecipe[]> {
  // pdf-parse v1 is CJS — require() avoids ESM/CJS interop issues in Next.js server routes.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfParse = require('pdf-parse') as (buf: Buffer) => Promise<{ text: string }>
  const data = await pdfParse(buffer)
  const text = cleanText(data.text)
  if (text.length < 200) return []

  const format = detectFormat(text)
  let recipes: ParsedRecipe[]
  if (format === 'A') recipes = parseAllFormatA(text, sourcePdf)
  else if (format === 'B') recipes = parseAllFormatB(text, sourcePdf)
  else recipes = parseAllFormatC(text, sourcePdf)

  // Deduplicate by name
  const seen = new Set<string>()
  return recipes.filter(r => {
    const k = r.name.toLowerCase().trim()
    if (seen.has(k) || k.length < 3) return false
    seen.add(k)
    return true
  })
}

export async function parseAllPdfsInDir(dir: string): Promise<ParsedRecipe[]> {
  const files = fs.readdirSync(dir).filter(f => f.toLowerCase().endsWith('.pdf'))
  const all: ParsedRecipe[] = []
  for (const file of files) {
    const buf = fs.readFileSync(path.join(dir, file))
    try {
      all.push(...await parsePdfBuffer(buf, file))
    } catch { /* skip unreadable */ }
  }
  return all
}
