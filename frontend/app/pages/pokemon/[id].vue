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
  <div class="page" :style="{ '--primary': primaryColor }">

    <div v-if="pokemonError" class="error-page">
      <p>ポケモンが見つかりませんでした。</p>
      <NuxtLink to="/" class="back-link">← 図鑑に戻る</NuxtLink>
    </div>

    <template v-else-if="pokemon">
      <!-- ヘッダー -->
      <header class="header" :style="{ background: `linear-gradient(135deg, ${primaryColor}cc, ${primaryColor}88)` }">
        <div class="header-inner">
          <div class="header-nav">
            <NuxtLink to="/" class="back-btn">← 図鑑へ戻る</NuxtLink>
            <div class="prev-next">
              <NuxtLink :to="`/pokemon/${prevId}`" class="nav-btn" :class="{ disabled: parseInt(id) <= 1 }">◀</NuxtLink>
              <NuxtLink :to="`/pokemon/${nextId}`" class="nav-btn">▶</NuxtLink>
            </div>
          </div>
          <div class="hero">
            <div class="hero-info">
              <p class="dex-number">#{{ padId(pokemon.id) }}</p>
              <h1 class="ja-name">{{ jaName }}</h1>
              <p class="en-name">{{ capitalize(pokemon.name) }}</p>
              <div class="types">
                <span v-for="type in types" :key="type" class="type-badge" :style="{ background: TYPE_COLORS[type] }">
                  {{ TYPE_NAMES_JA[type] ?? type }}
                </span>
              </div>
              <div class="basic-info">
                <div class="info-item">
                  <span class="info-label">高さ</span>
                  <span class="info-value">{{ (pokemon.height / 10).toFixed(1) }} m</span>
                </div>
                <div class="info-item">
                  <span class="info-label">重さ</span>
                  <span class="info-value">{{ (pokemon.weight / 10).toFixed(1) }} kg</span>
                </div>
              </div>
            </div>
            <div class="hero-sprite">
              <img
                :src="getOfficialArtUrl(pokemon.id)"
                :alt="jaName"
                class="official-art"
                @error="($event.target as HTMLImageElement).src = getSpriteUrl(pokemon.id)"
              />
            </div>
          </div>
        </div>
      </header>

      <main class="main">
        <!-- 図鑑テキスト -->
        <section v-if="flavorText" class="card">
          <p class="flavor-text">{{ flavorText }}</p>
        </section>

        <!-- 種族値 -->
        <section class="card">
          <h2 class="section-title">種族値</h2>
          <div class="stats-list">
            <div v-for="stat in stats" :key="stat.stat.name" class="stat-row">
              <span class="stat-name">{{ STAT_NAMES_JA[stat.stat.name] ?? stat.stat.name }}</span>
              <span class="stat-value">{{ stat.base_stat }}</span>
              <div class="stat-bar-bg">
                <div class="stat-bar" :style="{ width: `${(stat.base_stat / MAX_BASE_STAT) * 100}%`, background: STAT_COLORS[stat.stat.name] ?? '#aaa' }" />
              </div>
            </div>
            <div class="stat-row total-row">
              <span class="stat-name">合計</span>
              <span class="stat-value">{{ stats.reduce((s: number, st: any) => s + st.base_stat, 0) }}</span>
              <div class="stat-bar-bg" />
            </div>
          </div>
        </section>

        <!-- 覚える技 -->
        <section v-if="moveTabs.length" class="card">
          <h2 class="section-title">覚える技</h2>
          <!-- タブ -->
          <div class="move-tabs">
            <button
              v-for="tab in moveTabs"
              :key="tab.key"
              class="move-tab"
              :class="{ active: selectedMoveTab === tab.key }"
              @click="selectedMoveTab = tab.key"
            >
              {{ tab.label }}
              <span class="move-count">{{ tab.moves.length }}</span>
            </button>
          </div>
          <!-- 技リスト -->
          <div class="move-list">
            <button
              v-for="move in currentMoveList"
              :key="move.name"
              class="move-row"
              @click="openMoveModal(move.name)"
            >
              <span v-if="selectedMoveTab === 'level-up'" class="move-level">
                {{ move.level === 0 ? '進化' : `Lv.${move.level}` }}
              </span>
              <span class="move-name">{{ getMoveJaName(move.name) }}</span>
              <span class="move-arrow">›</span>
            </button>
          </div>
          <div v-if="tabMovesLoading" class="move-fetching">技名を読み込み中...</div>
          <div v-if="moveFetching" class="move-fetching">読み込み中...</div>
        </section>

        <!-- とくせい -->
        <section class="card">
          <h2 class="section-title">とくせい</h2>
          <ul class="ability-list">
            <li
              v-for="ab in abilities"
              :key="ab.ability.name"
              class="ability-item"
              :class="{ hidden: ab.is_hidden }"
              @click="openAbilityModal(ab.ability.name)"
            >
              <span class="ability-name">
                {{ getAbilityJaName(ab.ability.name) }}
                <span v-if="ab.is_hidden" class="hidden-tag">隠</span>
              </span>
              <span class="ability-en">{{ capitalize(ab.ability.name) }}</span>
            </li>
          </ul>
        </section>

        <!-- 実数値計算機 -->
        <section class="card">
          <div class="calc-header-row">
            <h2 class="section-title" style="margin-bottom:0">実数値計算機</h2>
            <button class="reset-btn" @click="resetToIdeal">理想値にリセット</button>
          </div>
          <p class="section-desc">個体値と努力値を入力すると実数値を計算します。デフォルトは個体値31（理想個体）です。</p>
          <div class="calc-settings">
            <div class="calc-setting-item">
              <label class="calc-label">レベル</label>
              <input v-model.number="calcLevel" type="number" min="1" max="100" class="level-input" />
            </div>
            <div class="calc-setting-item">
              <label class="calc-label">せいかく</label>
              <select v-model="selectedNatureName" class="nature-select">
                <option v-for="nat in NATURES" :key="nat.name" :value="nat.name">
                  {{ nat.jaName }}（{{ nat.name }}）<template v-if="nat.boost"> — {{ STAT_NAMES_JA[nat.boost] }}↑ {{ STAT_NAMES_JA[nat.reduce!] }}↓</template>
                </option>
              </select>
            </div>
            <div class="ev-total" :class="{ over: totalEV > 510 }">
              努力値合計: <strong>{{ totalEV }}</strong> / 510
              <span v-if="totalEV > 510" class="over-label">上限超過!</span>
            </div>
          </div>
          <div class="calc-rows">
            <div v-for="stat in stats" :key="stat.stat.name" class="calc-row" :class="`nature-${getNatureEffect(stat.stat.name)}`">
              <div class="calc-left">
                <div class="calc-stat-info">
                  <span class="calc-dot" :style="{ background: STAT_COLORS[stat.stat.name] }" />
                  <span class="calc-stat-name">{{ STAT_NAMES_JA[stat.stat.name] }}</span>
                  <span v-if="getNatureEffect(stat.stat.name) === 'boosted'" class="nature-mark up">↑</span>
                  <span v-else-if="getNatureEffect(stat.stat.name) === 'reduced'" class="nature-mark down">↓</span>
                  <span class="base-label">種族値 {{ stat.base_stat }}</span>
                </div>
                <div class="calc-result" :style="{ color: STAT_COLORS[stat.stat.name] }">
                  {{ calculatedStats[stat.stat.name] }}
                </div>
              </div>
              <div class="calc-inputs" v-if="ivCalc[stat.stat.name]">
                <div class="slider-row">
                  <span class="slider-label">個体値</span>
                  <input type="number" v-model.number="ivCalc[stat.stat.name]!.iv" min="0" max="31" class="num-input" />
                  <input type="range" v-model.number="ivCalc[stat.stat.name]!.iv" min="0" max="31" step="1" class="slider" :style="{ '--pct': `${(ivCalc[stat.stat.name]!.iv / 31) * 100}%`, '--color': STAT_COLORS[stat.stat.name] }" />
                  <span class="v-badge-wrap"><span v-if="ivCalc[stat.stat.name]!.iv === 31" class="v-badge">V</span></span>
                </div>
                <div class="slider-row">
                  <span class="slider-label">努力値</span>
                  <input type="number" :value="ivCalc[stat.stat.name]!.ev" @change="setEV(stat.stat.name, +($event.target as HTMLInputElement).value)" min="0" max="252" class="num-input" />
                  <input type="range" :value="ivCalc[stat.stat.name]!.ev" @input="setEV(stat.stat.name, +($event.target as HTMLInputElement).value)" min="0" max="252" step="2" class="slider" :style="{ '--pct': `${(ivCalc[stat.stat.name]!.ev / 252) * 100}%`, '--color': STAT_COLORS[stat.stat.name] }" />
                  <span class="v-badge-wrap"><span v-if="ivCalc[stat.stat.name]!.ev >= 252" class="max-badge">MAX</span></span>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
    </template>

    <!-- とくせいモーダル -->
    <Teleport to="body">
      <div v-if="abilityModal" class="modal-overlay" @click.self="abilityModal = null">
        <div class="modal">
          <button class="modal-close" @click="abilityModal = null">✕</button>
          <p class="modal-en-name">{{ abilityModal.enName }}</p>
          <h3 class="modal-ja-name">{{ abilityModal.jaName }}</h3>
          <!-- 実用的な効果（英語のみ取得可能） -->
          <div v-if="abilityModal.shortEffect" class="modal-effect-block">
            <p class="modal-effect-label">効果（英語）</p>
            <p class="modal-effect-text">{{ abilityModal.shortEffect }}</p>
          </div>
          <!-- 日本語ゲーム内説明文 -->
          <p v-if="abilityModal.jaFlavor" class="modal-flavor">{{ abilityModal.jaFlavor }}</p>
        </div>
      </div>
    </Teleport>

    <!-- 技モーダル -->
    <Teleport to="body">
      <div v-if="moveModal" class="modal-overlay" @click.self="moveModal = null">
        <div class="modal">
          <button class="modal-close" @click="moveModal = null">✕</button>
          <p class="modal-en-name">{{ moveModal.enName }}</p>
          <h3 class="modal-ja-name">{{ moveModal.jaName }}</h3>
          <!-- タイプ + 分類 -->
          <div class="modal-badges">
            <span class="type-badge-sm" :style="{ background: TYPE_COLORS[moveModal.type] ?? '#aaa' }">
              {{ TYPE_NAMES_JA[moveModal.type] ?? moveModal.type }}
            </span>
            <span class="class-badge" :style="{ background: DAMAGE_CLASS_COLORS[moveModal.damageClass] ?? '#aaa' }">
              {{ DAMAGE_CLASS_JA[moveModal.damageClass] ?? moveModal.damageClass }}
            </span>
          </div>
          <!-- 数値 -->
          <div class="modal-stats-grid">
            <div class="modal-stat-item">
              <span class="modal-stat-label">威力</span>
              <span class="modal-stat-value">{{ moveModal.power ?? '—' }}</span>
            </div>
            <div class="modal-stat-item">
              <span class="modal-stat-label">命中</span>
              <span class="modal-stat-value">{{ moveModal.accuracy != null ? `${moveModal.accuracy}%` : '—' }}</span>
            </div>
            <div class="modal-stat-item">
              <span class="modal-stat-label">PP</span>
              <span class="modal-stat-value">{{ moveModal.pp ?? '—' }}</span>
            </div>
            <div class="modal-stat-item">
              <span class="modal-stat-label">優先度</span>
              <span class="modal-stat-value">{{ moveModal.priority >= 0 ? `+${moveModal.priority}` : moveModal.priority }}</span>
            </div>
          </div>
          <!-- 効果 -->
          <p v-if="moveModal.flavorJa" class="modal-flavor">{{ moveModal.flavorJa }}</p>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.page { min-height: 100vh; background: #f0f2f5; }

/* エラー */
.error-page { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 60vh; gap: 16px; color: #666; }
.back-link { color: #cc0000; text-decoration: none; font-weight: 600; }

/* ヘッダー */
.header { color: white; }
.header-inner { max-width: 900px; margin: 0 auto; padding: 16px 24px 24px; }
.header-nav { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
.back-btn { color: white; text-decoration: none; font-weight: 600; font-size: 0.95rem; opacity: 0.9; }
.back-btn:hover { opacity: 1; }
.prev-next { display: flex; gap: 8px; }
.nav-btn { display: inline-block; width: 36px; height: 36px; line-height: 36px; text-align: center; border-radius: 50%; background: rgba(255,255,255,0.2); color: white; text-decoration: none; font-size: 0.9rem; transition: background 0.15s; }
.nav-btn:hover { background: rgba(255,255,255,0.35); }
.nav-btn.disabled { pointer-events: none; opacity: 0.4; }

/* ヒーロー */
.hero { display: flex; align-items: flex-end; justify-content: space-between; gap: 24px; }
.hero-info { flex: 1; }
.dex-number { font-size: 0.9rem; opacity: 0.8; letter-spacing: 0.05em; margin-bottom: 4px; }
.ja-name { font-size: 2.4rem; font-weight: 800; line-height: 1.1; margin: 0 0 4px; text-shadow: 0 2px 4px rgba(0,0,0,0.2); }
.en-name { font-size: 1rem; opacity: 0.8; margin-bottom: 12px; }
.types { display: flex; gap: 8px; margin-bottom: 20px; flex-wrap: wrap; }
.type-badge { display: inline-block; padding: 4px 16px; border-radius: 16px; font-size: 0.85rem; font-weight: 700; color: white; text-shadow: 0 1px 2px rgba(0,0,0,0.3); box-shadow: 0 2px 4px rgba(0,0,0,0.15); }
.basic-info { display: flex; gap: 24px; }
.info-item { display: flex; flex-direction: column; gap: 2px; }
.info-label { font-size: 0.75rem; opacity: 0.75; }
.info-value { font-size: 1.05rem; font-weight: 600; }
.hero-sprite { flex-shrink: 0; }
.official-art { width: 180px; height: 180px; object-fit: contain; filter: drop-shadow(0 4px 12px rgba(0,0,0,0.25)); }

/* メイン */
.main { max-width: 900px; margin: 0 auto; padding: 24px; display: flex; flex-direction: column; gap: 20px; }

/* カード共通 */
.card { background: white; border-radius: 16px; padding: 24px; box-shadow: 0 2px 8px rgba(0,0,0,0.07); }
.section-title { font-size: 1.1rem; font-weight: 700; margin: 0 0 16px; color: #222; padding-bottom: 8px; border-bottom: 2px solid var(--primary, #cc0000); }
.section-desc { font-size: 0.85rem; color: #777; margin-bottom: 18px; }

/* 図鑑テキスト */
.flavor-text { font-size: 0.95rem; line-height: 1.9; color: #444; margin: 0; }

/* 種族値 */
.stats-list { display: flex; flex-direction: column; gap: 10px; }
.stat-row { display: grid; grid-template-columns: 72px 40px 1fr; align-items: center; gap: 12px; }
.stat-name { font-size: 0.82rem; font-weight: 600; color: #666; text-align: right; }
.stat-value { font-size: 0.9rem; font-weight: 700; text-align: right; color: #222; }
.stat-bar-bg { height: 10px; background: #eee; border-radius: 5px; overflow: hidden; }
.stat-bar { height: 100%; border-radius: 5px; transition: width 0.4s ease; }
.total-row .stat-name { font-weight: 700; color: #333; }
.total-row .stat-value { font-size: 1rem; }

/* ========== 実数値計算機 ========== */
.calc-header-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.reset-btn { padding: 6px 14px; border-radius: 16px; border: 1.5px solid var(--primary, #cc0000); background: white; color: var(--primary, #cc0000); font-size: 0.8rem; font-weight: 600; cursor: pointer; transition: all 0.15s; }
.reset-btn:hover { background: var(--primary, #cc0000); color: white; }
.calc-settings { display: flex; gap: 16px; flex-wrap: wrap; align-items: center; margin-bottom: 20px; padding: 14px 16px; background: #f8f9fa; border-radius: 12px; }
.calc-setting-item { display: flex; align-items: center; gap: 8px; }
.calc-label { font-size: 0.85rem; font-weight: 600; color: #555; white-space: nowrap; }
.level-input { width: 70px; padding: 6px 10px; border: 2px solid #e0e0e0; border-radius: 8px; font-size: 0.95rem; text-align: center; outline: none; }
.level-input:focus { border-color: var(--primary); }
.nature-select { padding: 6px 10px; border: 2px solid #e0e0e0; border-radius: 8px; font-size: 0.88rem; background: white; outline: none; max-width: 240px; }
.nature-select:focus { border-color: var(--primary); }
.ev-total { font-size: 0.82rem; color: #666; }
.ev-total.over { color: #e53935; }
.over-label { margin-left: 4px; font-weight: 700; }
.calc-rows { display: flex; flex-direction: column; gap: 10px; }
.calc-row { display: grid; grid-template-columns: 180px 1fr; gap: 16px; align-items: center; padding: 14px 16px; background: #f8f9fa; border-radius: 12px; border-left: 4px solid #e0e0e0; }
.calc-row.nature-boosted { border-left-color: #e53935; background: #fff5f5; }
.calc-row.nature-reduced { border-left-color: #1e88e5; background: #f0f4ff; }
.calc-left { display: flex; flex-direction: column; gap: 6px; }
.calc-stat-info { display: flex; align-items: center; gap: 5px; }
.calc-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
.calc-stat-name { font-weight: 700; font-size: 0.95rem; color: #333; }
.nature-mark { font-size: 1rem; font-weight: 700; line-height: 1; }
.nature-mark.up { color: #e53935; }
.nature-mark.down { color: #1e88e5; }
.base-label { font-size: 0.72rem; color: #aaa; margin-left: 2px; }
.calc-result { font-size: 2rem; font-weight: 800; line-height: 1; }
.calc-inputs { display: flex; flex-direction: column; gap: 8px; }
.slider-row { display: grid; grid-template-columns: 36px 54px 1fr 28px; align-items: center; gap: 8px; }
.slider-label { font-size: 0.72rem; color: #888; }
.num-input { width: 54px; padding: 4px 6px; border: 1.5px solid #ddd; border-radius: 6px; text-align: center; font-size: 0.88rem; outline: none; }
.num-input:focus { border-color: var(--primary); }
.slider { width: 100%; min-width: 0; height: 6px; -webkit-appearance: none; appearance: none; background: linear-gradient(to right, var(--color, #cc0000) 0%, var(--color, #cc0000) var(--pct, 100%), #ddd var(--pct, 100%), #ddd 100%); border-radius: 3px; outline: none; cursor: pointer; }
.slider::-webkit-slider-thumb { -webkit-appearance: none; width: 18px; height: 18px; border-radius: 50%; background: white; border: 2px solid var(--color, #cc0000); cursor: pointer; box-shadow: 0 1px 4px rgba(0,0,0,0.2); }
.slider::-moz-range-thumb { width: 18px; height: 18px; border-radius: 50%; background: white; border: 2px solid var(--color, #cc0000); cursor: pointer; }
.v-badge-wrap { width: 28px; }
.v-badge { background: #f57f17; color: white; font-size: 0.7rem; font-weight: 700; padding: 1px 6px; border-radius: 4px; }
.max-badge { background: #1976d2; color: white; font-size: 0.65rem; font-weight: 700; padding: 1px 5px; border-radius: 4px; }

/* ========== 覚える技 ========== */
.move-tabs { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 16px; }
.move-tab {
  padding: 6px 14px;
  border-radius: 20px;
  border: 2px solid #e0e0e0;
  background: white;
  font-size: 0.82rem;
  font-weight: 600;
  color: #777;
  cursor: pointer;
  transition: all 0.15s;
  display: flex;
  align-items: center;
  gap: 5px;
}
.move-tab:hover { border-color: var(--primary); color: var(--primary); }
.move-tab.active { background: var(--primary, #cc0000); border-color: var(--primary, #cc0000); color: white; }
.move-count { font-size: 0.72rem; background: rgba(0,0,0,0.12); padding: 1px 6px; border-radius: 8px; }
.move-tab.active .move-count { background: rgba(255,255,255,0.25); }

.move-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 400px;
  overflow-y: auto;
  padding-right: 4px;
}
.move-list::-webkit-scrollbar { width: 4px; }
.move-list::-webkit-scrollbar-track { background: #f0f0f0; border-radius: 2px; }
.move-list::-webkit-scrollbar-thumb { background: #ccc; border-radius: 2px; }

.move-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 14px;
  background: #f8f9fa;
  border-radius: 8px;
  border: none;
  width: 100%;
  text-align: left;
  cursor: pointer;
  transition: background 0.12s;
  font-family: inherit;
  font-size: 0.9rem;
}
.move-row:hover { background: #eef0f2; }

.move-level {
  font-size: 0.72rem;
  font-weight: 700;
  color: #888;
  width: 42px;
  flex-shrink: 0;
  text-align: right;
}

.move-name { flex: 1; font-weight: 500; color: #333; }
.move-arrow { color: #bbb; font-size: 1rem; flex-shrink: 0; }
.move-fetching { text-align: center; font-size: 0.85rem; color: #aaa; padding: 8px 0; }

/* ========== とくせい ========== */
.ability-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 8px; }
.ability-item { display: flex; align-items: center; gap: 10px; padding: 12px 16px; background: #f8f9fa; border-radius: 10px; border-left: 4px solid var(--primary, #cc0000); cursor: pointer; transition: background 0.15s, transform 0.1s; }
.ability-item:hover { background: #eef0f2; transform: translateX(2px); }
.ability-item.hidden { border-left-color: #9c27b0; }
.ability-name { font-weight: 700; color: #222; font-size: 0.95rem; display: flex; align-items: center; gap: 5px; }
.ability-en { font-size: 0.78rem; color: #aaa; margin-left: auto; }
.hidden-tag { font-size: 0.62rem; background: #9c27b0; color: white; padding: 1px 5px; border-radius: 4px; font-weight: 700; vertical-align: middle; }

/* ========== モーダル共通 ========== */
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.45); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 24px; backdrop-filter: blur(2px); }
.modal { background: white; border-radius: 20px; padding: 28px; max-width: 440px; width: 100%; position: relative; box-shadow: 0 8px 40px rgba(0,0,0,0.2); }
.modal-close { position: absolute; top: 14px; right: 14px; width: 30px; height: 30px; border-radius: 50%; border: none; background: #f0f0f0; color: #666; font-size: 0.85rem; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: background 0.15s; }
.modal-close:hover { background: #e0e0e0; }
.modal-en-name { font-size: 0.78rem; color: #aaa; margin: 0 0 4px; }
.modal-ja-name { font-size: 1.6rem; font-weight: 800; color: #222; margin: 0 0 16px; border-bottom: 2px solid var(--primary, #cc0000); padding-bottom: 12px; }

/* とくせいモーダル固有 */
.modal-effect-block { background: #f8f9fa; border-radius: 10px; padding: 12px 14px; margin-bottom: 12px; }
.modal-effect-label { font-size: 0.75rem; font-weight: 700; color: #888; margin: 0 0 6px; text-transform: uppercase; letter-spacing: 0.05em; }
.modal-effect-text { font-size: 0.9rem; line-height: 1.7; color: #333; margin: 0; }
.modal-flavor { font-size: 0.88rem; line-height: 1.8; color: #666; margin: 0; border-top: 1px solid #f0f0f0; padding-top: 12px; }

/* 技モーダル固有 */
.modal-badges { display: flex; gap: 8px; margin-bottom: 20px; }
.type-badge-sm, .class-badge { display: inline-block; padding: 4px 14px; border-radius: 12px; font-size: 0.82rem; font-weight: 700; color: white; text-shadow: 0 1px 2px rgba(0,0,0,0.2); }

.modal-stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 20px; }
.modal-stat-item { background: #f8f9fa; border-radius: 10px; padding: 10px 8px; text-align: center; }
.modal-stat-label { display: block; font-size: 0.7rem; font-weight: 700; color: #888; margin-bottom: 4px; }
.modal-stat-value { display: block; font-size: 1.3rem; font-weight: 800; color: #222; }

/* レスポンシブ */
@media (max-width: 700px) {
  /* ヘッダー・レイアウト */
  .header-inner { padding: 12px 16px 16px; }
  .hero { flex-direction: column-reverse; align-items: center; }
  .hero-info { text-align: center; }
  .basic-info { justify-content: center; }
  .types { justify-content: center; }
  .official-art { width: 140px; height: 140px; }
  .ja-name { font-size: 1.8rem; }

  /* メインコンテンツ */
  .main { padding: 12px; gap: 12px; }
  .card { padding: 16px; }

  /* 実数値計算機: 設定欄 */
  .calc-settings { flex-direction: column; align-items: stretch; gap: 10px; }
  .calc-setting-item { width: 100%; }
  .nature-select { max-width: 100%; width: 100%; }

  /* 実数値計算機: 各行 */
  .calc-row { grid-template-columns: 1fr; }
  .calc-left { flex-direction: row; align-items: center; justify-content: space-between; }
  .calc-result { font-size: 1.6rem; }

  /* モーダル: ボトムシート風 */
  .modal-overlay { padding: 0; align-items: flex-end; }
  .modal {
    border-radius: 20px 20px 0 0;
    max-width: 100%;
    max-height: 85vh;
    overflow-y: auto;
    padding: 20px 16px;
  }
  .modal-stats-grid { grid-template-columns: repeat(2, 1fr); }
}
</style>
