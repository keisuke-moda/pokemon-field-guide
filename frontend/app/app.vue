<template>
  <div>
    <NuxtPage />
  </div>
</template>

<style>
*, *::before, *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

html {
  font-family: 'Hiragino Kaku Gothic ProN', 'Noto Sans JP', 'Yu Gothic', sans-serif;
  font-size: 16px;
  -webkit-font-smoothing: antialiased;
}

body {
  background: #f0f2f5;
  color: #222;
}

input[type="number"]::-webkit-inner-spin-button,
input[type="number"]::-webkit-outer-spin-button {
  opacity: 1;
}

a {
  color: inherit;
}
</style>
