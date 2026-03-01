<script setup lang="ts">
const { fetchPokemonList, fetchPokemon, fetchPokemonSpecies } = usePokemon()

const ITEMS_PER_PAGE = 49
const selectedGenIndex = ref(0)
const searchQuery = ref('')
const page = ref(1)

// 世代が変わったら1ページ目に戻る
watch([selectedGenIndex, searchQuery], () => { page.value = 1 })

// 選択世代のポケモン一覧を取得
const { data: genPokemon, pending: listLoading } = await useAsyncData(
  () => `pokemon-gen-${selectedGenIndex.value}`,
  () => {
    const gen = GENERATIONS[selectedGenIndex.value] ?? GENERATIONS[0]!
    const [min, max] = gen.range
    return fetchPokemonList(max - min + 1, min - 1)
  },
)

// 検索フィルタ
const allResults = computed(() => genPokemon.value?.results ?? [])
// genHash: genPokemon が読み込まれたことを pageData キーに伝えるためのマーカー
const genHash = computed(() => allResults.value.length)

// ========== 日本語名インデックス（バックグラウンドで構築） ==========
const jaNameIndex = ref<Record<number, string>>({})

const buildJaIndex = async (items: { name: string; url: string }[], genSnapshot: number) => {
  jaNameIndex.value = {}
  if (!items.length) return
  const CHUNK = 50
  for (let i = 0; i < items.length; i += CHUNK) {
    // 世代が切り替わったら中断
    if (selectedGenIndex.value !== genSnapshot) return
    const chunk = items.slice(i, i + CHUNK)
    const results = await Promise.allSettled(
      chunk.map(p => fetchPokemonSpecies(getIdFromUrl(p.url)))
    )
    if (selectedGenIndex.value !== genSnapshot) return
    const entries: Record<number, string> = {}
    for (const r of results) {
      if (r.status === 'fulfilled') {
        const ja = getJaName(r.value.names ?? [], '')
        if (ja) entries[r.value.id] = ja
      }
    }
    jaNameIndex.value = { ...jaNameIndex.value, ...entries }
  }
}

// クライアントサイドでのみ実行
onMounted(() => {
  if (allResults.value.length) buildJaIndex(allResults.value, selectedGenIndex.value)
  watch(allResults, (items) => buildJaIndex(items, selectedGenIndex.value))
})

// 日本語文字を含む検索かどうか
const isJapaneseQuery = (q: string) => /[\u3040-\u9FFF\uFF00-\uFFEF]/.test(q)

const filtered = computed(() => {
  if (!searchQuery.value.trim()) return allResults.value
  const q = searchQuery.value.trim()
  if (isJapaneseQuery(q)) {
    return allResults.value.filter(p => {
      const id = getIdFromUrl(p.url)
      return (jaNameIndex.value[id] ?? '').includes(q)
    })
  }
  const ql = q.toLowerCase()
  return allResults.value.filter(p => p.name.toLowerCase().includes(ql))
})

const totalPages = computed(() => Math.ceil(filtered.value.length / ITEMS_PER_PAGE))

const currentPageItems = computed(() => {
  const start = (page.value - 1) * ITEMS_PER_PAGE
  return filtered.value.slice(start, start + ITEMS_PER_PAGE)
})

// 現ページのポケモン詳細（タイプ + 日本語名）を並列取得
// キーに genHash を含めることで genPokemon 読み込み後に確実に再取得する
const { data: pageData, pending: pageLoading } = useAsyncData(
  () => `page-data-g${selectedGenIndex.value}-h${genHash.value}-p${page.value}-q${searchQuery.value}`,
  async () => {
    const items = currentPageItems.value
    if (!items.length) return { details: {} as Record<number, any>, species: {} as Record<number, any> }
    const ids = items.map(p => getIdFromUrl(p.url))
    const [detailsRes, speciesRes] = await Promise.all([
      Promise.allSettled(ids.map(id => fetchPokemon(id))),
      Promise.allSettled(ids.map(id => fetchPokemonSpecies(id))),
    ])
    const details: Record<number, any> = {}
    const species: Record<number, any> = {}
    for (const r of detailsRes) {
      if (r.status === 'fulfilled') details[r.value.id] = r.value
    }
    for (const r of speciesRes) {
      if (r.status === 'fulfilled') species[r.value.id] = r.value
    }
    return { details, species }
  },
)

const isLoading = computed(() => listLoading.value || pageLoading.value)

// カードデータ取得ヘルパー
const getTypes = (id: number): string[] =>
  pageData.value?.details[id]?.types?.map((t: any) => t.type.name) ?? []

const getDisplayName = (id: number, enName: string): string => {
  const sp = pageData.value?.species[id]
  if (!sp?.names) return capitalize(enName)
  return getJaName(sp.names, capitalize(enName))
}

const primaryType = (id: number): string => getTypes(id)[0] ?? 'normal'

const cardStyle = (id: number) => {
  const color = TYPE_COLORS[primaryType(id)] ?? '#A8A878'
  return {
    background: `linear-gradient(145deg, ${color}22 0%, ${color}55 100%)`,
    borderColor: `${color}88`,
  }
}
</script>

<template>
  <div class="page">
    <!-- ヘッダー -->
    <header class="header">
      <div class="header-inner">
        <div class="logo">
          <span class="logo-icon">◎</span>
          <h1>ポケモン図鑑</h1>
        </div>
        <div class="search-wrap">
          <input
            v-model="searchQuery"
            class="search-input"
            placeholder="名前で検索（例: フシギダネ, bulbasaur）"
            type="search"
          />
        </div>
      </div>

      <!-- 世代フィルター -->
      <div class="gen-filter-wrap">
        <div class="gen-filter">
          <button
            v-for="(gen, i) in GENERATIONS"
            :key="i"
            class="gen-btn"
            :class="{ active: selectedGenIndex === i }"
            @click="selectedGenIndex = i"
          >
            {{ gen.short }}
          </button>
        </div>
      </div>
    </header>

    <main class="main">
      <!-- ローディング -->
      <div v-if="isLoading" class="loading">
        <div class="spinner" />
        <p>読み込み中...</p>
      </div>

      <template v-else>
        <p class="result-count">
          <strong>{{ filtered.length }}</strong> 匹
          <span v-if="searchQuery.trim()">（「{{ searchQuery }}」の検索結果）</span>
          <span v-else>— {{ GENERATIONS[selectedGenIndex]?.label }}</span>
        </p>

        <div v-if="filtered.length === 0" class="no-result">
          該当するポケモンが見つかりませんでした。
        </div>

        <div v-else class="grid">
          <NuxtLink
            v-for="item in currentPageItems"
            :key="item.url"
            :to="`/pokemon/${getIdFromUrl(item.url)}`"
            class="card"
            :style="cardStyle(getIdFromUrl(item.url))"
          >
            <div class="card-number">#{{ padId(getIdFromUrl(item.url)) }}</div>
            <img
              :src="getSpriteUrl(getIdFromUrl(item.url))"
              :alt="item.name"
              class="card-sprite"
              loading="lazy"
            />
            <div class="card-name">{{ getDisplayName(getIdFromUrl(item.url), item.name) }}</div>
            <div class="card-types">
              <span
                v-for="type in getTypes(getIdFromUrl(item.url))"
                :key="type"
                class="type-badge"
                :style="{ background: TYPE_COLORS[type] ?? '#A8A878' }"
              >
                {{ TYPE_NAMES_JA[type] ?? type }}
              </span>
            </div>
          </NuxtLink>
        </div>

        <div v-if="totalPages > 1" class="pagination">
          <button class="page-btn" :disabled="page <= 1" @click="page--">← 前へ</button>
          <span class="page-info">{{ page }} / {{ totalPages }}</span>
          <button class="page-btn" :disabled="page >= totalPages" @click="page++">次へ →</button>
        </div>
      </template>
    </main>
  </div>
</template>

<style scoped>
.page {
  min-height: 100vh;
  background: #f0f2f5;
}

/* ヘッダー */
.header {
  background: #cc0000;
  color: white;
  box-shadow: 0 2px 8px rgba(0,0,0,0.3);
  position: sticky;
  top: 0;
  z-index: 100;
}

.header-inner {
  max-width: 1200px;
  margin: 0 auto;
  padding: 14px 24px 10px;
  display: flex;
  align-items: center;
  gap: 20px;
  flex-wrap: wrap;
}

.logo {
  display: flex;
  align-items: center;
  gap: 10px;
}

.logo-icon { font-size: 1.8rem; filter: drop-shadow(0 0 4px rgba(255,255,255,0.5)); }

.logo h1 {
  font-size: 1.5rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  margin: 0;
  white-space: nowrap;
}

.search-wrap { flex: 1; min-width: 200px; }

.search-input {
  width: 100%;
  padding: 9px 16px;
  border-radius: 24px;
  border: 2px solid rgba(255,255,255,0.4);
  background: rgba(255,255,255,0.15);
  color: white;
  font-size: 0.95rem;
  outline: none;
  transition: border-color 0.2s, background 0.2s;
}
.search-input::placeholder { color: rgba(255,255,255,0.7); }
.search-input:focus { border-color: white; background: rgba(255,255,255,0.25); }

/* 世代フィルター */
.gen-filter-wrap {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 24px 10px;
  overflow-x: auto;
}

.gen-filter {
  display: flex;
  gap: 6px;
  white-space: nowrap;
}

.gen-btn {
  padding: 5px 12px;
  border-radius: 16px;
  border: 2px solid rgba(255,255,255,0.4);
  background: transparent;
  color: rgba(255,255,255,0.85);
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
}
.gen-btn:hover { border-color: white; color: white; }
.gen-btn.active {
  background: white;
  color: #cc0000;
  border-color: white;
}

/* メイン */
.main {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px 24px;
}

.loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80px 0;
  color: #666;
  gap: 16px;
}

.spinner {
  width: 44px;
  height: 44px;
  border: 4px solid #ddd;
  border-top-color: #cc0000;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

.result-count {
  color: #666;
  font-size: 0.88rem;
  margin-bottom: 14px;
}

.no-result {
  text-align: center;
  padding: 60px 0;
  color: #999;
  font-size: 1rem;
}

/* グリッド */
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(148px, 1fr));
  gap: 14px;
}

/* カード */
.card {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 14px 10px 10px;
  border-radius: 16px;
  border: 2px solid transparent;
  text-decoration: none;
  color: #333;
  background: white;
  transition: transform 0.15s, box-shadow 0.15s;
  cursor: pointer;
}
.card:hover { transform: translateY(-4px); box-shadow: 0 8px 24px rgba(0,0,0,0.15); }

.card-number { font-size: 0.7rem; color: #aaa; font-weight: 600; align-self: flex-start; }

.card-sprite {
  width: 88px;
  height: 88px;
  object-fit: contain;
  image-rendering: pixelated;
}

.card-name {
  font-size: 0.85rem;
  font-weight: 700;
  text-align: center;
  margin: 4px 0 6px;
  color: #222;
}

.card-types {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
  justify-content: center;
  min-height: 20px;
}

.type-badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 0.68rem;
  font-weight: 700;
  color: white;
  text-shadow: 0 1px 2px rgba(0,0,0,0.3);
}

/* ページネーション */
.pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  margin-top: 36px;
  padding-bottom: 40px;
}

.page-btn {
  padding: 9px 22px;
  border-radius: 24px;
  border: 2px solid #cc0000;
  background: white;
  color: #cc0000;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}
.page-btn:hover:not(:disabled) { background: #cc0000; color: white; }
.page-btn:disabled { border-color: #ccc; color: #ccc; cursor: not-allowed; }

.page-info { font-size: 0.9rem; color: #555; min-width: 70px; text-align: center; }
</style>
