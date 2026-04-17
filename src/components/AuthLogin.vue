<script setup>
import { ref } from 'vue'
import { db } from '../services/supabase'

const authEmail = ref('')
const authPassword = ref('')

const signUp = async () => {
  const { error } = await db.auth.signUp({ email: authEmail.value, password: authPassword.value })
  if (error) alert(error.message)
  else alert("Account created! You can now log in.")
}

const signIn = async () => {
  const { error } = await db.auth.signInWithPassword({ email: authEmail.value, password: authPassword.value })
  if (error) alert(error.message)
}
</script>

<template>
  <div class="card full-width-header" style="max-width: 400px; margin: 100px auto; text-align: center;">
    <h2 style="justify-content: center;"><i class="fas fa-lock"></i> Lab Login</h2>
    <p style="font-size: 0.85rem; opacity: 0.8;">Sign in to access your inventory.</p>
    <div class="input-group">
      <input type="email" v-model="authEmail" placeholder="Email Address">
    </div>
    <div class="input-group">
      <input type="password" v-model="authPassword" placeholder="Password">
    </div>
    <button @click="signUp" class="secondary" style="width: 100%; margin-bottom: 10px;">Create Account</button>
    <button @click="signIn" style="width: 100%;">Log In</button>
  </div>
</template>