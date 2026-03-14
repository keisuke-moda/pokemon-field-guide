<template>
  <div>
    <NuxtPage />
  </div>
</template>

<style>
/* Tailwind preflight がリセットしない箇所のみ残す */
input[type="number"]::-webkit-inner-spin-button,
input[type="number"]::-webkit-outer-spin-button {
  opacity: 1;
}

a {
  color: inherit;
}
</style>
