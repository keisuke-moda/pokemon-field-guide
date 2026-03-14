<script setup lang="ts">
const route = useRoute()
const id = computed(() => route.params.id as string)

const { fetchPokemon, fetchPokemonSpecies, fetchAbility, fetchMove } = usePokemon()

// ポケモンデータと種族データを並列取得
const [{ data: pokemon, error: pokemonError }, { data: species }] = await Promise.all([
  useAsyncData(`pokemon-${id.value}`, () => fetchPokemon(id.value)),
  useAsyncData(`species-${id.value}`, () =>
    fetchPokemonSpecies(id.value).catch(() => null)
  ),
])

// 日本語名
const jaName = computed(() => {
  const names = species.value?.names
  if (!names) return capitalize(pokemon.value?.name ?? '')
  return getJaName(names, capitalize(pokemon.value?.name ?? ''))
})

// 図鑑テキスト（日本語・最新版）
const flavorText = computed(() => {
  const entries: any[] = species.value?.flavor_text_entries ?? []
  return entries.filter(f => f.language.name === 'ja').at(-1)
    ?.flavor_text.replace(/[\f\n]/g, ' ') ?? ''
})

// タイプ・種族値・とくせい
const types = computed<string[]>(() => pokemon.value?.types?.map((t: any) => t.type.name) ?? [])
const stats = computed(() => pokemon.value?.stats ?? [])
const abilities = computed(() =>
  (pokemon.value?.abilities ?? []).sort((a: any, b: any) => a.slot - b.slot)
)

// ========== とくせい（日本語 + モーダル） ==========

const { data: abilityData } = await useAsyncData(
  `abilities-${id.value}`,
  async () => {
    const names: string[] = abilities.value.map((a: any) => a.ability.name)
    if (!names.length) return {} as Record<string, any>
    const results = await Promise.allSettled(names.map(n => fetchAbility(n)))
    const map: Record<string, any> = {}
    for (const r of results) {
      if (r.status === 'fulfilled') map[r.value.name] = r.value
    }
    return map
  },
)

const getAbilityJaName = (name: string): string => {
  const data = abilityData.value?.[name]
  if (!data?.names) return capitalize(name)
  return getJaName(data.names, capitalize(name))
}

// とくせいモーダル
const abilityModal = ref<{
  jaName: string
  enName: string
  shortEffect: string // 実用的な効果文（英語のみ、日本語訳はAPIに存在しない）
  jaFlavor: string    // 日本語ゲーム内説明文
} | null>(null)

const openAbilityModal = (name: string) => {
  const data = abilityData.value?.[name]
  if (!data) return
  const jaName = getJaName(data.names ?? [], capitalize(name))
  const shortEffect = (data.effect_entries ?? [])
    .find((e: any) => e.language.name === 'en')?.short_effect
    ?.replace('$effect_chance%', `${data.effect_chance ?? 0}%`) ?? ''
  const jaFlavor = [...(data.flavor_text_entries ?? [])]
    .filter((e: any) => e.language.name === 'ja')
    .at(-1)?.flavor_text?.replace(/[\f\n]/g, ' ') ?? ''
  abilityModal.value = { jaName, enName: capitalize(name), shortEffect, jaFlavor }
}

// ========== 技 ==========

const LEARN_METHOD_JA: Record<string, string> = {
  'level-up': 'レベルアップ',
  'machine':  'わざマシン',
  'egg':      'タマゴわざ',
  'tutor':    'おしえわざ',
}

const DAMAGE_CLASS_JA: Record<string, string> = {
  physical: '物理',
  special:  '特殊',
  status:   '変化',
}

const DAMAGE_CLASS_COLORS: Record<string, string> = {
  physical: '#C03028',
  special:  '#6890F0',
  status:   '#A8A878',
}

// 技データを習得方法ごとにグループ化（最新バージョングループ優先）
const processedMoves = computed(() => {
  const raw: any[] = pokemon.value?.moves ?? []
  const groups: Record<string, { name: string; level: number }[]> = {
    'level-up': [],
    'machine':  [],
    'egg':      [],
    'tutor':    [],
  }
  for (const m of raw) {
    const detail = m.version_group_details.at(-1)
    if (!detail) continue
    const method: string = detail.move_learn_method?.name ?? ''
    if (!(method in groups)) continue
    groups[method]!.push({ name: m.move.name, level: detail.level_learned_at ?? 0 })
  }
  groups['level-up']!.sort((a, b) => a.level - b.level)
  for (const key of ['machine', 'egg', 'tutor'] as const) {
    groups[key]!.sort((a, b) => a.name.localeCompare(b.name))
  }
  return groups
})

const moveTabs = computed(() =>
  (['level-up', 'machine', 'egg', 'tutor'] as const)
    .map(k => ({ key: k, label: LEARN_METHOD_JA[k]!, moves: processedMoves.value[k]! }))
    .filter(t => t.moves.length > 0)
)

const selectedMoveTab = ref('level-up')
watch(moveTabs, (tabs) => {
  if (tabs.length && !tabs.find(t => t.key === selectedMoveTab.value)) {
    selectedMoveTab.value = tabs[0]?.key ?? 'level-up'
  }
}, { immediate: true })

const currentMoveList = computed(() =>
  moveTabs.value.find(t => t.key === selectedMoveTab.value)?.moves ?? []
)

// 技モーダル
const moveCache = reactive<Record<string, any>>({})
const moveModal = ref<{
  jaName: string
  enName: string
  type: string
  damageClass: string
  power: number | null
  accuracy: number | null
  pp: number | null
  priority: number
  flavorJa: string
} | null>(null)
const moveFetching = ref(false)

const getMoveJaName = (name: string): string => {
  const data = moveCache[name]
  if (!data?.names) return capitalize(name)
  return getJaName(data.names, capitalize(name))
}

const tabMovesLoading = ref(false)
const loadTabMoves = async (tabKey: string) => {
  const moves = (processedMoves.value as any)[tabKey] ?? []
  const toLoad = moves.filter((m: any) => !moveCache[m.name]).map((m: any) => m.name)
  if (!toLoad.length) return
  tabMovesLoading.value = true
  const CHUNK = 25
  for (let i = 0; i < toLoad.length; i += CHUNK) {
    const results = await Promise.allSettled(
      toLoad.slice(i, i + CHUNK).map((n: string) => fetchMove(n))
    )
    for (const r of results) {
      if (r.status === 'fulfilled') moveCache[r.value.name] = r.value
    }
  }
  tabMovesLoading.value = false
}

onMounted(() => loadTabMoves(selectedMoveTab.value))
watch(selectedMoveTab, tab => loadTabMoves(tab))

const openMoveModal = async (name: string) => {
  if (moveFetching.value) return
  moveFetching.value = true
  if (!moveCache[name]) {
    try { moveCache[name] = await fetchMove(name) }
    catch { moveCache[name] = null }
  }
  const data = moveCache[name]
  if (data) {
    const jaName = getJaName(data.names ?? [], capitalize(name))
    const flavorJa = [...(data.flavor_text_entries ?? [])]
      .filter((e: any) => e.language.name === 'ja')
      .at(-1)?.flavor_text?.replace(/[\f\n]/g, ' ') ?? ''
    moveModal.value = {
      jaName,
      enName: capitalize(name),
      type: data.type?.name ?? '',
      damageClass: data.damage_class?.name ?? 'status',
      power: data.power,
      accuracy: data.accuracy,
      pp: data.pp,
      priority: data.priority ?? 0,
      flavorJa,
    }
  }
  moveFetching.value = false
}

// ========== 実数値計算機 ==========

const STAT_ORDER = ['hp', 'attack', 'defense', 'special-attack', 'special-defense', 'speed']

const calcLevel = ref(50)
const selectedNatureName = ref('hardy')

const ivCalc = ref<Record<string, { iv: number; ev: number }>>(
  Object.fromEntries(STAT_ORDER.map(s => [s, { iv: 31, ev: 0 }]))
)

const selectedNature = computed(
  () => NATURES.find(n => n.name === selectedNatureName.value) ?? NATURES[0]!
)

const totalEV = computed(() =>
  Object.values(ivCalc.value).reduce((sum, v) => sum + (v?.ev || 0), 0)
)

const calculatedStats = computed(() => {
  const nature = selectedNature.value
  return Object.fromEntries(
    stats.value.map((stat: any) => {
      const statName: string = stat.stat.name
      const input = ivCalc.value[statName]
      if (!input) return [statName, 0]
      const multiplier = nature ? getNatureMultiplier(nature, statName) : 1.0
      return [statName, calculateStat(statName, stat.base_stat, calcLevel.value, input.ev, input.iv, multiplier)]
    })
  )
})

const getNatureEffect = (statName: string): 'boosted' | 'reduced' | 'neutral' => {
  const n = selectedNature.value
  if (!n) return 'neutral'
  if (n.boost === statName) return 'boosted'
  if (n.reduce === statName) return 'reduced'
  return 'neutral'
}

const resetToIdeal = () => {
  for (const key of STAT_ORDER) {
    if (ivCalc.value[key]) {
      ivCalc.value[key]!.iv = 31
      ivCalc.value[key]!.ev = 0
    }
  }
}

const setEV = (statName: string, raw: number) => {
  const otherTotal = Object.entries(ivCalc.value)
    .filter(([k]) => k !== statName)
    .reduce((sum, [, v]) => sum + (v?.ev || 0), 0)
  ivCalc.value[statName]!.ev = Math.max(0, Math.min(252, 510 - otherTotal, raw))
}


// ナビゲーション
const prevId = computed(() => Math.max(1, parseInt(id.value) - 1))
const nextId = computed(() => parseInt(id.value) + 1)

// テーマカラー
const primaryColor = computed(() => TYPE_COLORS[types.value[0] ?? ''] ?? '#A8A878')
const MAX_BASE_STAT = 255
</script>

<template>
  <div class="min-h-screen bg-[#f0f2f5]" :style="{ '--primary': primaryColor }">

    <div v-if="pokemonError" class="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-[#666]">
      <p>ポケモンが見つかりませんでした。</p>
      <NuxtLink to="/" class="text-[#cc0000] no-underline font-semibold">← 図鑑に戻る</NuxtLink>
    </div>

    <template v-else-if="pokemon">
      <!-- ヘッダー -->
      <header class="text-white" :style="{ background: `linear-gradient(135deg, ${primaryColor}cc, ${primaryColor}88)` }">
        <div class="max-w-[900px] mx-auto px-6 pt-4 pb-6">
          <div class="flex justify-between items-center mb-5">
            <NuxtLink to="/" class="text-white no-underline font-semibold text-[0.95rem] opacity-90 hover:opacity-100">← 図鑑へ戻る</NuxtLink>
            <div class="flex gap-2">
              <NuxtLink
                :to="`/pokemon/${prevId}`"
                class="inline-flex items-center justify-center w-9 h-9 rounded-full bg-white/20 text-white no-underline text-[0.9rem] transition-all hover:bg-white/35"
                :class="{ 'pointer-events-none opacity-40': parseInt(id) <= 1 }"
              >◀</NuxtLink>
              <NuxtLink
                :to="`/pokemon/${nextId}`"
                class="inline-flex items-center justify-center w-9 h-9 rounded-full bg-white/20 text-white no-underline text-[0.9rem] transition-all hover:bg-white/35"
              >▶</NuxtLink>
            </div>
          </div>
          <div class="flex items-end justify-between gap-6 max-[700px]:flex-col-reverse max-[700px]:items-center">
            <div class="flex-1 max-[700px]:text-center">
              <p class="text-[0.9rem] opacity-80 tracking-[0.05em] mb-1">#{{ padId(pokemon.id) }}</p>
              <h1 class="text-[2.4rem] max-[700px]:text-[1.8rem] font-extrabold leading-tight m-0 mb-1 [text-shadow:0_2px_4px_rgba(0,0,0,0.2)]">{{ jaName }}</h1>
              <p class="text-base opacity-80 mb-3">{{ capitalize(pokemon.name) }}</p>
              <div class="flex gap-2 mb-5 flex-wrap max-[700px]:justify-center">
                <span
                  v-for="type in types"
                  :key="type"
                  class="inline-block px-4 py-1 rounded-2xl text-[0.85rem] font-bold text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.3)] shadow-sm"
                  :style="{ background: TYPE_COLORS[type] }"
                >
                  {{ TYPE_NAMES_JA[type] ?? type }}
                </span>
              </div>
              <div class="flex gap-6 max-[700px]:justify-center">
                <div class="flex flex-col gap-0.5">
                  <span class="text-[0.75rem] opacity-75">高さ</span>
                  <span class="text-[1.05rem] font-semibold">{{ (pokemon.height / 10).toFixed(1) }} m</span>
                </div>
                <div class="flex flex-col gap-0.5">
                  <span class="text-[0.75rem] opacity-75">重さ</span>
                  <span class="text-[1.05rem] font-semibold">{{ (pokemon.weight / 10).toFixed(1) }} kg</span>
                </div>
              </div>
            </div>
            <div class="flex-shrink-0">
              <img
                :src="getOfficialArtUrl(pokemon.id)"
                :alt="jaName"
                class="w-[180px] h-[180px] max-[700px]:w-[140px] max-[700px]:h-[140px] object-contain [filter:drop-shadow(0_4px_12px_rgba(0,0,0,0.25))]"
                @error="($event.target as HTMLImageElement).src = getSpriteUrl(pokemon.id)"
              />
            </div>
          </div>
        </div>
      </header>

      <main class="max-w-[900px] mx-auto p-6 max-[700px]:p-3 flex flex-col gap-5 max-[700px]:gap-3">
        <!-- 図鑑テキスト -->
        <section v-if="flavorText" class="bg-white rounded-2xl p-6 max-[700px]:p-4 shadow-[0_2px_8px_rgba(0,0,0,0.07)]">
          <p class="text-[0.95rem] leading-[1.9] text-[#444] m-0">{{ flavorText }}</p>
        </section>

        <!-- 種族値 -->
        <section class="bg-white rounded-2xl p-6 max-[700px]:p-4 shadow-[0_2px_8px_rgba(0,0,0,0.07)]">
          <h2 class="text-[1.1rem] font-bold mb-4 text-[#222] pb-2 border-b-2 [border-color:var(--primary,#cc0000)]">種族値</h2>
          <div class="flex flex-col gap-[10px]">
            <div
              v-for="stat in stats"
              :key="stat.stat.name"
              class="grid grid-cols-[72px_40px_1fr] items-center gap-3"
              :class="{ 'bg-gradient-to-r from-[#fffbea] to-transparent rounded-md -mx-1.5 px-1.5': stat.base_stat >= 100 }"
            >
              <span class="text-[0.82rem] font-semibold text-[#666] text-right">{{ STAT_NAMES_JA[stat.stat.name] ?? stat.stat.name }}</span>
              <span
                class="text-[0.9rem] font-bold text-right"
                :class="stat.base_stat >= 100 ? 'text-[#d4900a] font-extrabold' : 'text-[#222]'"
              >
                {{ stat.base_stat }}<span v-if="stat.base_stat >= 100" class="text-[0.65rem] text-[#f5a623] ml-0.5 align-super">★</span>
              </span>
              <div class="h-[10px] bg-[#eee] rounded-[5px] overflow-hidden">
                <div
                  class="h-full rounded-[5px] [transition:width_0.4s_ease]"
                  :class="{ '[box-shadow:0_0_6px_1px_rgba(245,166,35,0.5)]': stat.base_stat >= 100 }"
                  :style="{ width: `${(stat.base_stat / MAX_BASE_STAT) * 100}%`, background: STAT_COLORS[stat.stat.name] ?? '#aaa' }"
                />
              </div>
            </div>
            <div class="grid grid-cols-[72px_40px_1fr] items-center gap-3">
              <span class="text-[0.82rem] font-bold text-[#333] text-right">合計</span>
              <span class="text-base font-bold text-right text-[#222]">{{ stats.reduce((s: number, st: any) => s + st.base_stat, 0) }}</span>
              <div class="h-[10px] bg-[#eee] rounded-[5px] overflow-hidden" />
            </div>
          </div>
        </section>

        <!-- 覚える技 -->
        <section v-if="moveTabs.length" class="bg-white rounded-2xl p-6 max-[700px]:p-4 shadow-[0_2px_8px_rgba(0,0,0,0.07)]">
          <h2 class="text-[1.1rem] font-bold mb-4 text-[#222] pb-2 border-b-2 [border-color:var(--primary,#cc0000)]">覚える技</h2>
          <!-- タブ -->
          <div class="flex gap-[6px] flex-wrap mb-4">
            <button
              v-for="tab in moveTabs"
              :key="tab.key"
              class="px-[14px] py-[6px] rounded-[20px] border-2 border-[#e0e0e0] bg-white text-[0.82rem] font-semibold text-[#777] cursor-pointer transition-all flex items-center gap-[5px] hover:[border-color:var(--primary,#cc0000)] hover:[color:var(--primary,#cc0000)]"
              :class="{ '[background:var(--primary,#cc0000)] [border-color:var(--primary,#cc0000)] !text-white': selectedMoveTab === tab.key }"
              @click="selectedMoveTab = tab.key"
            >
              {{ tab.label }}
              <span
                class="text-[0.72rem] bg-black/12 px-[6px] py-[1px] rounded-lg"
                :class="{ 'bg-white/25': selectedMoveTab === tab.key }"
              >{{ tab.moves.length }}</span>
            </button>
          </div>
          <!-- 技リスト -->
          <div class="move-list flex flex-col gap-1 max-h-[400px] overflow-y-auto pr-1">
            <button
              v-for="move in currentMoveList"
              :key="move.name"
              class="flex items-center gap-[10px] px-[14px] py-[9px] bg-[#f8f9fa] rounded-lg border-none w-full text-left cursor-pointer transition-[background] duration-[120ms] font-[inherit] text-[0.9rem] hover:bg-[#eef0f2]"
              @click="openMoveModal(move.name)"
            >
              <span v-if="selectedMoveTab === 'level-up'" class="text-[0.72rem] font-bold text-[#888] w-[42px] flex-shrink-0 text-right">
                {{ move.level === 0 ? '進化' : `Lv.${move.level}` }}
              </span>
              <span class="flex-1 font-medium text-[#333]">{{ getMoveJaName(move.name) }}</span>
              <span class="text-[#bbb] text-base flex-shrink-0">›</span>
            </button>
          </div>
          <div v-if="tabMovesLoading" class="text-center text-[0.85rem] text-[#aaa] py-2">技名を読み込み中...</div>
          <div v-if="moveFetching" class="text-center text-[0.85rem] text-[#aaa] py-2">読み込み中...</div>
        </section>

        <!-- とくせい -->
        <section class="bg-white rounded-2xl p-6 max-[700px]:p-4 shadow-[0_2px_8px_rgba(0,0,0,0.07)]">
          <h2 class="text-[1.1rem] font-bold mb-4 text-[#222] pb-2 border-b-2 [border-color:var(--primary,#cc0000)]">とくせい</h2>
          <ul class="list-none p-0 m-0 flex flex-col gap-2">
            <li
              v-for="ab in abilities"
              :key="ab.ability.name"
              class="flex items-center gap-[10px] px-4 py-3 bg-[#f8f9fa] rounded-[10px] border-l-4 cursor-pointer transition-all hover:bg-[#eef0f2] hover:translate-x-0.5"
              :class="ab.is_hidden ? '[border-left-color:#9c27b0]' : '[border-left-color:var(--primary,#cc0000)]'"
              @click="openAbilityModal(ab.ability.name)"
            >
              <span class="font-bold text-[#222] text-[0.95rem] flex items-center gap-[5px]">
                {{ getAbilityJaName(ab.ability.name) }}
                <span v-if="ab.is_hidden" class="text-[0.62rem] bg-[#9c27b0] text-white px-[5px] py-[1px] rounded font-bold">隠</span>
              </span>
              <span class="text-[0.78rem] text-[#aaa] ml-auto">{{ capitalize(ab.ability.name) }}</span>
            </li>
          </ul>
        </section>

        <!-- 実数値計算機 -->
        <section class="bg-white rounded-2xl p-6 max-[700px]:p-4 shadow-[0_2px_8px_rgba(0,0,0,0.07)]">
          <div class="flex justify-between items-center mb-4">
            <h2 class="text-[1.1rem] font-bold text-[#222] pb-2 border-b-2 [border-color:var(--primary,#cc0000)] mb-0">実数値計算機</h2>
            <button
              class="px-[14px] py-[6px] rounded-2xl border-[1.5px] [border-color:var(--primary,#cc0000)] bg-white [color:var(--primary,#cc0000)] text-[0.8rem] font-semibold cursor-pointer transition-all hover:[background:var(--primary,#cc0000)] hover:text-white"
              @click="resetToIdeal"
            >理想値にリセット</button>
          </div>
          <p class="text-[0.85rem] text-[#777] mb-[18px]">個体値と努力値を入力すると実数値を計算します。デフォルトは個体値31（理想個体）です。</p>
          <div class="flex gap-4 flex-wrap items-center mb-5 px-4 py-[14px] bg-[#f8f9fa] rounded-xl max-[700px]:flex-col max-[700px]:items-stretch">
            <div class="flex items-center gap-2">
              <label class="text-[0.85rem] font-semibold text-[#555] whitespace-nowrap">レベル</label>
              <input
                v-model.number="calcLevel"
                type="number"
                min="1"
                max="100"
                class="w-[70px] px-[10px] py-[6px] border-2 border-[#e0e0e0] rounded-lg text-[0.95rem] text-center outline-none focus:[border-color:var(--primary,#cc0000)]"
              />
            </div>
            <div class="flex items-center gap-2 max-[700px]:w-full">
              <label class="text-[0.85rem] font-semibold text-[#555] whitespace-nowrap">せいかく</label>
              <select
                v-model="selectedNatureName"
                class="px-[10px] py-[6px] border-2 border-[#e0e0e0] rounded-lg text-[0.88rem] bg-white outline-none max-w-[240px] max-[700px]:max-w-full max-[700px]:flex-1 focus:[border-color:var(--primary,#cc0000)]"
              >
                <option v-for="nat in NATURES" :key="nat.name" :value="nat.name">
                  {{ nat.jaName }}（{{ nat.name }}）<template v-if="nat.boost"> — {{ STAT_NAMES_JA[nat.boost] }}↑ {{ STAT_NAMES_JA[nat.reduce!] }}↓</template>
                </option>
              </select>
            </div>
            <div class="text-[0.82rem]" :class="totalEV > 510 ? 'text-[#e53935]' : 'text-[#666]'">
              努力値合計: <strong>{{ totalEV }}</strong> / 510
              <span v-if="totalEV > 510" class="ml-1 font-bold">上限超過!</span>
            </div>
          </div>
          <div class="flex flex-col gap-[10px]">
            <div
              v-for="stat in stats"
              :key="stat.stat.name"
              class="grid grid-cols-[180px_1fr] max-[700px]:grid-cols-1 gap-4 items-center px-4 py-[14px] bg-[#f8f9fa] rounded-xl border-l-4"
              :class="{
                '[border-left-color:#e53935] bg-[#fff5f5]': getNatureEffect(stat.stat.name) === 'boosted',
                '[border-left-color:#1e88e5] bg-[#f0f4ff]': getNatureEffect(stat.stat.name) === 'reduced',
                'border-l-[#e0e0e0]': getNatureEffect(stat.stat.name) === 'neutral',
              }"
            >
              <div class="flex flex-col gap-[6px] max-[700px]:flex-row max-[700px]:items-center max-[700px]:justify-between">
                <div class="flex items-center gap-[5px]">
                  <span class="w-[10px] h-[10px] rounded-full flex-shrink-0" :style="{ background: STAT_COLORS[stat.stat.name] }" />
                  <span class="font-bold text-[0.95rem] text-[#333]">{{ STAT_NAMES_JA[stat.stat.name] }}</span>
                  <span v-if="getNatureEffect(stat.stat.name) === 'boosted'" class="text-base font-bold leading-none text-[#e53935]">↑</span>
                  <span v-else-if="getNatureEffect(stat.stat.name) === 'reduced'" class="text-base font-bold leading-none text-[#1e88e5]">↓</span>
                  <span class="text-[0.72rem] text-[#aaa] ml-0.5">種族値 {{ stat.base_stat }}</span>
                </div>
                <div class="text-[2rem] max-[700px]:text-[1.6rem] font-extrabold leading-none" :style="{ color: STAT_COLORS[stat.stat.name] }">
                  {{ calculatedStats[stat.stat.name] }}
                </div>
              </div>
              <div v-if="ivCalc[stat.stat.name]" class="flex flex-col gap-2">
                <div class="grid grid-cols-[36px_54px_1fr_28px] items-center gap-2">
                  <span class="text-[0.72rem] text-[#888]">個体値</span>
                  <input
                    type="number"
                    v-model.number="ivCalc[stat.stat.name]!.iv"
                    min="0"
                    max="31"
                    class="w-[54px] px-[6px] py-1 border-[1.5px] border-[#ddd] rounded-md text-center text-[0.88rem] outline-none focus:[border-color:var(--primary,#cc0000)]"
                  />
                  <input
                    type="range"
                    v-model.number="ivCalc[stat.stat.name]!.iv"
                    min="0"
                    max="31"
                    step="1"
                    class="slider w-full min-w-0 h-[6px] rounded-[3px] outline-none cursor-pointer"
                    :style="{ '--pct': `${(ivCalc[stat.stat.name]!.iv / 31) * 100}%`, '--color': STAT_COLORS[stat.stat.name] }"
                  />
                  <span class="w-[28px]"><span v-if="ivCalc[stat.stat.name]!.iv === 31" class="bg-[#f57f17] text-white text-[0.7rem] font-bold px-[6px] py-[1px] rounded">V</span></span>
                </div>
                <div class="grid grid-cols-[36px_54px_1fr_28px] items-center gap-2">
                  <span class="text-[0.72rem] text-[#888]">努力値</span>
                  <input
                    type="number"
                    :value="ivCalc[stat.stat.name]!.ev"
                    @change="setEV(stat.stat.name, +($event.target as HTMLInputElement).value)"
                    min="0"
                    max="252"
                    class="w-[54px] px-[6px] py-1 border-[1.5px] border-[#ddd] rounded-md text-center text-[0.88rem] outline-none focus:[border-color:var(--primary,#cc0000)]"
                  />
                  <input
                    type="range"
                    :value="ivCalc[stat.stat.name]!.ev"
                    @input="setEV(stat.stat.name, +($event.target as HTMLInputElement).value)"
                    min="0"
                    max="252"
                    step="2"
                    class="slider w-full min-w-0 h-[6px] rounded-[3px] outline-none cursor-pointer"
                    :style="{ '--pct': `${(ivCalc[stat.stat.name]!.ev / 252) * 100}%`, '--color': STAT_COLORS[stat.stat.name] }"
                  />
                  <span class="w-[28px]"><span v-if="ivCalc[stat.stat.name]!.ev >= 252" class="bg-[#1976d2] text-white text-[0.65rem] font-bold px-[5px] py-[1px] rounded">MAX</span></span>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
    </template>

    <!-- とくせいモーダル -->
    <Teleport to="body">
      <div
        v-if="abilityModal"
        class="fixed inset-0 bg-black/45 flex items-center justify-center z-[1000] p-6 backdrop-blur-sm max-[700px]:p-0 max-[700px]:items-end"
        @click.self="abilityModal = null"
      >
        <div class="bg-white rounded-[20px] p-7 max-w-[440px] w-full relative shadow-[0_8px_40px_rgba(0,0,0,0.2)] max-[700px]:rounded-t-[20px] max-[700px]:rounded-b-none max-[700px]:max-w-full max-[700px]:max-h-[85vh] max-[700px]:overflow-y-auto max-[700px]:px-4 max-[700px]:py-5">
          <button
            class="absolute top-[14px] right-[14px] w-[30px] h-[30px] rounded-full border-none bg-[#f0f0f0] text-[#666] text-[0.85rem] cursor-pointer flex items-center justify-center transition-[background] hover:bg-[#e0e0e0]"
            @click="abilityModal = null"
          >✕</button>
          <p class="text-[0.78rem] text-[#aaa] m-0 mb-1">{{ abilityModal.enName }}</p>
          <h3 class="text-[1.6rem] font-extrabold text-[#222] m-0 mb-4 border-b-2 [border-color:var(--primary,#cc0000)] pb-3">{{ abilityModal.jaName }}</h3>
          <div v-if="abilityModal.shortEffect" class="bg-[#f8f9fa] rounded-[10px] px-[14px] py-3 mb-3">
            <p class="text-[0.75rem] font-bold text-[#888] m-0 mb-[6px] uppercase tracking-[0.05em]">効果（英語）</p>
            <p class="text-[0.9rem] leading-[1.7] text-[#333] m-0">{{ abilityModal.shortEffect }}</p>
          </div>
          <p v-if="abilityModal.jaFlavor" class="text-[0.88rem] leading-[1.8] text-[#666] m-0 border-t border-[#f0f0f0] pt-3">{{ abilityModal.jaFlavor }}</p>
        </div>
      </div>
    </Teleport>

    <!-- 技モーダル -->
    <Teleport to="body">
      <div
        v-if="moveModal"
        class="fixed inset-0 bg-black/45 flex items-center justify-center z-[1000] p-6 backdrop-blur-sm max-[700px]:p-0 max-[700px]:items-end"
        @click.self="moveModal = null"
      >
        <div class="bg-white rounded-[20px] p-7 max-w-[440px] w-full relative shadow-[0_8px_40px_rgba(0,0,0,0.2)] max-[700px]:rounded-t-[20px] max-[700px]:rounded-b-none max-[700px]:max-w-full max-[700px]:max-h-[85vh] max-[700px]:overflow-y-auto max-[700px]:px-4 max-[700px]:py-5">
          <button
            class="absolute top-[14px] right-[14px] w-[30px] h-[30px] rounded-full border-none bg-[#f0f0f0] text-[#666] text-[0.85rem] cursor-pointer flex items-center justify-center transition-[background] hover:bg-[#e0e0e0]"
            @click="moveModal = null"
          >✕</button>
          <p class="text-[0.78rem] text-[#aaa] m-0 mb-1">{{ moveModal.enName }}</p>
          <h3 class="text-[1.6rem] font-extrabold text-[#222] m-0 mb-4 border-b-2 [border-color:var(--primary,#cc0000)] pb-3">{{ moveModal.jaName }}</h3>
          <div class="flex gap-2 mb-5">
            <span
              class="inline-block px-[14px] py-1 rounded-xl text-[0.82rem] font-bold text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.2)]"
              :style="{ background: TYPE_COLORS[moveModal.type] ?? '#aaa' }"
            >{{ TYPE_NAMES_JA[moveModal.type] ?? moveModal.type }}</span>
            <span
              class="inline-block px-[14px] py-1 rounded-xl text-[0.82rem] font-bold text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.2)]"
              :style="{ background: DAMAGE_CLASS_COLORS[moveModal.damageClass] ?? '#aaa' }"
            >{{ DAMAGE_CLASS_JA[moveModal.damageClass] ?? moveModal.damageClass }}</span>
          </div>
          <div class="grid grid-cols-4 max-[700px]:grid-cols-2 gap-2 mb-5">
            <div class="bg-[#f8f9fa] rounded-[10px] px-2 py-[10px] text-center">
              <span class="block text-[0.7rem] font-bold text-[#888] mb-1">威力</span>
              <span class="block text-[1.3rem] font-extrabold text-[#222]">{{ moveModal.power ?? '—' }}</span>
            </div>
            <div class="bg-[#f8f9fa] rounded-[10px] px-2 py-[10px] text-center">
              <span class="block text-[0.7rem] font-bold text-[#888] mb-1">命中</span>
              <span class="block text-[1.3rem] font-extrabold text-[#222]">{{ moveModal.accuracy != null ? `${moveModal.accuracy}%` : '—' }}</span>
            </div>
            <div class="bg-[#f8f9fa] rounded-[10px] px-2 py-[10px] text-center">
              <span class="block text-[0.7rem] font-bold text-[#888] mb-1">PP</span>
              <span class="block text-[1.3rem] font-extrabold text-[#222]">{{ moveModal.pp ?? '—' }}</span>
            </div>
            <div class="bg-[#f8f9fa] rounded-[10px] px-2 py-[10px] text-center">
              <span class="block text-[0.7rem] font-bold text-[#888] mb-1">優先度</span>
              <span class="block text-[1.3rem] font-extrabold text-[#222]">{{ moveModal.priority >= 0 ? `+${moveModal.priority}` : moveModal.priority }}</span>
            </div>
          </div>
          <p v-if="moveModal.flavorJa" class="text-[0.88rem] leading-[1.8] text-[#666] m-0 border-t border-[#f0f0f0] pt-3">{{ moveModal.flavorJa }}</p>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
/* スライダー（擬似要素はTailwindで記述不可のため残す） */
.slider {
  -webkit-appearance: none;
  appearance: none;
  background: linear-gradient(to right, var(--color, #cc0000) 0%, var(--color, #cc0000) var(--pct, 100%), #ddd var(--pct, 100%), #ddd 100%);
}
.slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: white;
  border: 2px solid var(--color, #cc0000);
  cursor: pointer;
  box-shadow: 0 1px 4px rgba(0,0,0,0.2);
}
.slider::-moz-range-thumb {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: white;
  border: 2px solid var(--color, #cc0000);
  cursor: pointer;
}

/* スクロールバー（擬似要素はTailwindで記述不可のため残す） */
.move-list::-webkit-scrollbar { width: 4px; }
.move-list::-webkit-scrollbar-track { background: #f0f0f0; border-radius: 2px; }
.move-list::-webkit-scrollbar-thumb { background: #ccc; border-radius: 2px; }
</style>
