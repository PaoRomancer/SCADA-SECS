<script setup>
useHead({
  htmlAttrs: { lang: 'th' },
  title: 'DC Cooling SCADA',
  link: [
    { rel: 'icon', type: 'image/png', href: '/image/KMITLmainlogo.png' },
    { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
    { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
    { 
      rel: 'stylesheet',
      href: 'https://fonts.googleapis.com/css2?family=Google+Sans:ital,opsz,wght@0,17..18,400..700;1,17..18,400..700&family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&display=swap'
    },
    {
      rel: 'stylesheet',
      href: 'https://fonts.googleapis.com/css2?family=Noto+Sans+Thai:wght@400;600;700;800&display=swap'
    }
  ]
})
</script>

<template>
  <NuxtPage />
</template>
