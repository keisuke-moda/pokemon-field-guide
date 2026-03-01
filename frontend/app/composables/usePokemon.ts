// ========== 定数 ==========

export const STAT_NAMES_JA: Record<string, string> = {
  hp: 'HP',
  attack: 'こうげき',
  defense: 'ぼうぎょ',
  'special-attack': 'とくこう',
  'special-defense': 'とくぼう',
  speed: 'すばやさ',
}

export const STAT_COLORS: Record<string, string> = {
  hp: '#FF5959',
  attack: '#F5AC78',
  defense: '#FAE078',
  'special-attack': '#9DB7F5',
  'special-defense': '#A7DB8D',
  speed: '#FA92B2',
}

export const TYPE_NAMES_JA: Record<string, string> = {
  normal: 'ノーマル',
  fire: 'ほのお',
  water: 'みず',
  electric: 'でんき',
  grass: 'くさ',
  ice: 'こおり',
  fighting: 'かくとう',
  poison: 'どく',
  ground: 'じめん',
  flying: 'ひこう',
  psychic: 'エスパー',
  bug: 'むし',
  rock: 'いわ',
  ghost: 'ゴースト',
  dragon: 'ドラゴン',
  dark: 'あく',
  steel: 'はがね',
  fairy: 'フェアリー',
}

export const TYPE_COLORS: Record<string, string> = {
  normal: '#A8A878',
  fire: '#F08030',
  water: '#6890F0',
  electric: '#F8D030',
  grass: '#78C850',
  ice: '#98D8D8',
  fighting: '#C03028',
  poison: '#A040A0',
  ground: '#E0C068',
  flying: '#A890F0',
  psychic: '#F85888',
  bug: '#A8B820',
  rock: '#B8A038',
  ghost: '#705898',
  dragon: '#7038F8',
  dark: '#705848',
  steel: '#B8B8D0',
  fairy: '#EE99AC',
}

export const NATURES = [
  { name: 'hardy',    jaName: 'がんばりや', boost: null as string | null,   reduce: null as string | null },
  { name: 'lonely',   jaName: 'さみしがり', boost: 'attack',                reduce: 'defense' },
  { name: 'brave',    jaName: 'ゆうかん',   boost: 'attack',                reduce: 'speed' },
  { name: 'adamant',  jaName: 'いじっぱり', boost: 'attack',                reduce: 'special-attack' },
  { name: 'naughty',  jaName: 'やんちゃ',   boost: 'attack',                reduce: 'special-defense' },
  { name: 'bold',     jaName: 'ずぶとい',   boost: 'defense',               reduce: 'attack' },
  { name: 'docile',   jaName: 'すなお',     boost: null,                    reduce: null },
  { name: 'relaxed',  jaName: 'のんき',     boost: 'defense',               reduce: 'speed' },
  { name: 'impish',   jaName: 'わんぱく',   boost: 'defense',               reduce: 'special-attack' },
  { name: 'lax',      jaName: 'のうてんき', boost: 'defense',               reduce: 'special-defense' },
  { name: 'timid',    jaName: 'おくびょう', boost: 'speed',                 reduce: 'attack' },
  { name: 'hasty',    jaName: 'せっかち',   boost: 'speed',                 reduce: 'defense' },
  { name: 'serious',  jaName: 'まじめ',     boost: null,                    reduce: null },
  { name: 'jolly',    jaName: 'ようき',     boost: 'speed',                 reduce: 'special-attack' },
  { name: 'naive',    jaName: 'むじゃき',   boost: 'speed',                 reduce: 'special-defense' },
  { name: 'modest',   jaName: 'ひかえめ',   boost: 'special-attack',        reduce: 'attack' },
  { name: 'mild',     jaName: 'おっとり',   boost: 'special-attack',        reduce: 'defense' },
  { name: 'quiet',    jaName: 'れいせい',   boost: 'special-attack',        reduce: 'speed' },
  { name: 'bashful',  jaName: 'てれや',     boost: null,                    reduce: null },
  { name: 'rash',     jaName: 'うっかりや', boost: 'special-attack',        reduce: 'special-defense' },
  { name: 'calm',     jaName: 'おだやか',   boost: 'special-defense',       reduce: 'attack' },
  { name: 'gentle',   jaName: 'おとなしい', boost: 'special-defense',       reduce: 'defense' },
  { name: 'sassy',    jaName: 'なまいき',   boost: 'special-defense',       reduce: 'speed' },
  { name: 'careful',  jaName: 'しんちょう', boost: 'special-defense',       reduce: 'special-attack' },
  { name: 'quirky',   jaName: 'きまぐれ',   boost: null,                    reduce: null },
]

export type Nature = typeof NATURES[number]

// ========== ユーティリティ関数 ==========

export const getNatureMultiplier = (nature: Nature, statName: string): number => {
  if (nature.boost === statName) return 1.1
  if (nature.reduce === statName) return 0.9
  return 1.0
}

/**
 * 個体値計算
 * 指定した実数値に対して、可能な個体値 (0〜31) をすべて返す
 *
 * HP計算式:  floor((2×種族値 + 個体値 + floor(努力値/4)) × Lv / 100) + Lv + 10
 * その他:    floor((floor((2×種族値 + 個体値 + floor(努力値/4)) × Lv / 100) + 5) × 性格補正)
 */
export const calculatePossibleIVs = (
  statName: string,
  actualStat: number,
  baseStat: number,
  level: number,
  ev: number,
  natureMultiplier: number,
): number[] => {
  if (!actualStat || !baseStat || level < 1 || level > 100) return []
  const evBonus = Math.floor(Math.max(0, Math.min(252, ev || 0)) / 4)
  const result: number[] = []

  for (let iv = 0; iv <= 31; iv++) {
    let calc: number
    if (statName === 'hp') {
      calc = Math.floor((2 * baseStat + iv + evBonus) * level / 100) + level + 10
    } else {
      calc = Math.floor(
        (Math.floor((2 * baseStat + iv + evBonus) * level / 100) + 5) * natureMultiplier
      )
    }
    if (calc === actualStat) result.push(iv)
  }
  return result
}

export const formatIVRange = (ivs: number[]): string => {
  if (!ivs || ivs.length === 0) return '---'
  if (ivs.length === 1) return String(ivs[0])
  return `${ivs[0]}〜${ivs[ivs.length - 1]}`
}

export const getIVQuality = (ivs: number[]): 'perfect' | 'high' | 'mid' | 'low' | 'unknown' => {
  if (!ivs || ivs.length === 0) return 'unknown'
  const max = ivs[ivs.length - 1] as number | undefined
  if (max === undefined) return 'unknown'
  if (max === 31) return 'perfect'
  if (max >= 28) return 'high'
  if (max >= 15) return 'mid'
  return 'low'
}

export const getIdFromUrl = (url: string): number => {
  const parts = url.split('/').filter(Boolean)
  const last = parts[parts.length - 1]
  return parseInt(last ?? '0')
}

export const getSpriteUrl = (id: number): string =>
  `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`

export const getOfficialArtUrl = (id: number): string =>
  `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`

export const capitalize = (s: string): string =>
  s.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')

export const padId = (id: number): string => String(id).padStart(4, '0')

// 日本語名取得ヘルパー
export const getJaName = (
  names: { name: string; language: { name: string } }[],
  fallback = '',
): string =>
  names?.find(n => n.language.name === 'ja')?.name
  ?? names?.find(n => n.language.name === 'ja-Hrkt')?.name
  ?? fallback

// ========== 実数値計算 ==========
// HP:    floor((2×種族値 + 個体値 + floor(努力値/4)) × Lv / 100) + Lv + 10
// その他: floor((floor((2×種族値 + 個体値 + floor(努力値/4)) × Lv / 100) + 5) × 性格補正)
export const calculateStat = (
  statName: string,
  baseStat: number,
  level: number,
  ev: number,
  iv: number,
  natureMultiplier: number,
): number => {
  if (!baseStat || level < 1 || level > 100) return 0
  const evBonus = Math.floor(Math.max(0, Math.min(252, ev || 0)) / 4)
  const clampedIv = Math.max(0, Math.min(31, iv || 0))
  if (statName === 'hp') {
    return Math.floor((2 * baseStat + clampedIv + evBonus) * level / 100) + level + 10
  }
  return Math.floor(
    (Math.floor((2 * baseStat + clampedIv + evBonus) * level / 100) + 5) * natureMultiplier
  )
}

// ========== 世代定義 ==========
export const GENERATIONS = [
  { label: 'すべて',             short: '全世代', range: [1,   1025] as [number, number] },
  { label: '第1世代（カントー）', short: '第1世代', range: [1,    151] as [number, number] },
  { label: '第2世代（ジョウト）', short: '第2世代', range: [152,  251] as [number, number] },
  { label: '第3世代（ホウエン）', short: '第3世代', range: [252,  386] as [number, number] },
  { label: '第4世代（シンオウ）', short: '第4世代', range: [387,  493] as [number, number] },
  { label: '第5世代（イッシュ）', short: '第5世代', range: [494,  649] as [number, number] },
  { label: '第6世代（カロス）',   short: '第6世代', range: [650,  721] as [number, number] },
  { label: '第7世代（アローラ）', short: '第7世代', range: [722,  809] as [number, number] },
  { label: '第8世代（ガラル）',   short: '第8世代', range: [810,  905] as [number, number] },
  { label: '第9世代（パルデア）', short: '第9世代', range: [906, 1025] as [number, number] },
]

// ========== API呼び出し ==========

export const usePokemon = () => {
  const { public: { apiBase } } = useRuntimeConfig()

  const fetchPokemonList = (limit = 20, offset = 0) =>
    $fetch<{ count: number; results: { name: string; url: string }[] }>(
      `${apiBase}/pokemon?limit=${limit}&offset=${offset}`
    )

  const fetchPokemon = (id: string | number) =>
    $fetch<any>(`${apiBase}/pokemon/${id}`)

  const fetchPokemonSpecies = (id: string | number) =>
    $fetch<any>(`${apiBase}/pokemon-species/${id}`)

  const fetchAbility = (name: string) =>
    $fetch<any>(`${apiBase}/ability/${name}`)

  const fetchMove = (name: string) =>
    $fetch<any>(`${apiBase}/move/${name}`)

  return { fetchPokemonList, fetchPokemon, fetchPokemonSpecies, fetchAbility, fetchMove }
}
