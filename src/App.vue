<template>
  <div>
    <button class="absolute h-10 w-fit p-2 bg-white rounded-lg m-4 hover:bg-slate-100 active:scale-105 duration-100 transition-all" @click="makeCubeJump">Jump</button>
    <ThreejsScene class="h-full w-full" :cubeJump="cubeJump"/>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import ThreejsScene from './components/ThreejsScene.vue'

const cubeJump = ref(false)

const makeCubeJump = () => {
  cubeJump.value = true
  setTimeout(() => {
    cubeJump.value = false
  }, 1000)
}
</script>


<style scoped>

</style>
