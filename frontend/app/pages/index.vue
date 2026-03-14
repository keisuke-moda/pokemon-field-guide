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
  <div class="min-h-screen bg-[#f0f2f5]">
    <!-- ヘッダー -->
    <header class="bg-[#cc0000] text-white shadow-md sticky top-0 z-[100]">
      <div class="max-w-[1200px] mx-auto px-6 pt-[14px] pb-[10px] flex items-center gap-5 flex-wrap">
        <div class="flex items-center gap-[10px]">
          <span class="text-[1.8rem] [filter:drop-shadow(0_0_4px_rgba(255,255,255,0.5))]">◎</span>
          <h1 class="text-2xl font-bold tracking-wide m-0 whitespace-nowrap">ポケモン図鑑</h1>
        </div>
        <div class="flex-1 min-w-[200px]">
          <input
            v-model="searchQuery"
            class="w-full py-[9px] px-4 rounded-3xl border-2 border-white/40 bg-white/15 text-white text-[0.95rem] outline-none transition-all placeholder:text-white/70 focus:border-white focus:bg-white/25"
            placeholder="名前で検索（例: フシギダネ, bulbasaur）"
            type="search"
          />
        </div>
      </div>

      <!-- 世代フィルター -->
      <div class="max-w-[1200px] mx-auto px-6 pb-[10px] overflow-x-auto">
        <div class="flex gap-[6px] whitespace-nowrap">
          <button
            v-for="(gen, i) in GENERATIONS"
            :key="i"
            class="px-3 py-[5px] rounded-2xl border-2 border-white/40 bg-transparent text-white/85 text-[0.8rem] font-semibold cursor-pointer transition-all whitespace-nowrap hover:border-white hover:text-white"
            :class="{ 'bg-white !text-[#cc0000] border-white': selectedGenIndex === i }"
            @click="selectedGenIndex = i"
          >
            {{ gen.short }}
          </button>
        </div>
      </div>
    </header>

    <main class="max-w-[1200px] mx-auto py-5 px-6">
      <!-- ローディング -->
      <div v-if="isLoading" class="flex flex-col items-center justify-center py-20 text-[#666] gap-4">
        <div class="w-11 h-11 border-4 border-[#ddd] border-t-[#cc0000] rounded-full animate-spin" />
        <p>読み込み中...</p>
      </div>

      <template v-else>
        <p class="text-[#666] text-[0.88rem] mb-[14px]">
          <strong>{{ filtered.length }}</strong> 匹
          <span v-if="searchQuery.trim()">（「{{ searchQuery }}」の検索結果）</span>
          <span v-else>— {{ GENERATIONS[selectedGenIndex]?.label }}</span>
        </p>

        <div v-if="filtered.length === 0" class="text-center py-[60px] text-[#999] text-base">
          該当するポケモンが見つかりませんでした。
        </div>

        <div v-else class="grid grid-cols-[repeat(auto-fill,minmax(148px,1fr))] gap-[14px]">
          <NuxtLink
            v-for="item in currentPageItems"
            :key="item.url"
            :to="`/pokemon/${getIdFromUrl(item.url)}`"
            class="flex flex-col items-center pt-[14px] px-[10px] pb-[10px] rounded-2xl border-2 border-transparent no-underline text-[#333] bg-white transition-all cursor-pointer hover:-translate-y-1 hover:shadow-xl"
            :style="cardStyle(getIdFromUrl(item.url))"
          >
            <div class="text-[0.7rem] text-[#aaa] font-semibold self-start">#{{ padId(getIdFromUrl(item.url)) }}</div>
            <img
              :src="getSpriteUrl(getIdFromUrl(item.url))"
              :alt="item.name"
              class="w-[88px] h-[88px] object-contain [image-rendering:pixelated]"
              loading="lazy"
            />
            <div class="text-[0.85rem] font-bold text-center mt-1 mb-[6px] text-[#222]">{{ getDisplayName(getIdFromUrl(item.url), item.name) }}</div>
            <div class="flex gap-1 flex-wrap justify-center min-h-5">
              <span
                v-for="type in getTypes(getIdFromUrl(item.url))"
                :key="type"
                class="inline-block px-2 py-[2px] rounded-[10px] text-[0.68rem] font-bold text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.3)]"
                :style="{ background: TYPE_COLORS[type] ?? '#A8A878' }"
              >
                {{ TYPE_NAMES_JA[type] ?? type }}
              </span>
            </div>
          </NuxtLink>
        </div>

        <div v-if="totalPages > 1" class="flex items-center justify-center gap-4 mt-9 pb-10">
          <button
            class="py-[9px] px-[22px] rounded-3xl border-2 border-[#cc0000] bg-white text-[#cc0000] text-[0.9rem] font-semibold cursor-pointer transition-all enabled:hover:bg-[#cc0000] enabled:hover:text-white disabled:border-[#ccc] disabled:text-[#ccc] disabled:cursor-not-allowed"
            :disabled="page <= 1"
            @click="page--"
          >← 前へ</button>
          <span class="text-[0.9rem] text-[#555] min-w-[70px] text-center">{{ page }} / {{ totalPages }}</span>
          <button
            class="py-[9px] px-[22px] rounded-3xl border-2 border-[#cc0000] bg-white text-[#cc0000] text-[0.9rem] font-semibold cursor-pointer transition-all enabled:hover:bg-[#cc0000] enabled:hover:text-white disabled:border-[#ccc] disabled:text-[#ccc] disabled:cursor-not-allowed"
            :disabled="page >= totalPages"
            @click="page++"
          >次へ →</button>
        </div>
      </template>
    </main>
  </div>
</template>
