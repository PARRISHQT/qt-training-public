<script setup>
import OrderPage from './components/OrderPage.vue';
import KitchenPage from './components/KitchenPage.vue';

const isKitchen = window.location.pathname.startsWith('/kitchen');
</script>

<template>
  <KitchenPage v-if="isKitchen" />
  <OrderPage v-else />
</template>
