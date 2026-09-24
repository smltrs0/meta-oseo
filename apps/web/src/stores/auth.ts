/**
 * Sesión del estudiante. Sin contraseña en esta etapa (PLAN §1, decisión del equipo):
 * se entra con tipo + número de identificación y el servidor responde con un JWT.
 *
 * Solo el token se persiste (localStorage, dentro de try/catch); el usuario se vuelve a
 * pedir con GET /api/me al recargar la página (`restore`).
 */
import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import { ApiError, apiFetch } from '@/lib/api';
import type { TipoIdentificacion } from '@/lib/identificacion';
import { normalizarNumero } from '@/lib/identificacion';
import { borrarToken, guardarToken, leerToken } from '@/lib/tokenStorage';
import { useContextoStore } from '@/stores/contextoPedagogico';
import { useProgresoStore } from '@/stores/progreso';
import type { LoginPayload, Nivel, RegistroPayload, TokenResponse, Usuario } from '@/types/api';

export interface DatosRegistro {
  nombre: string;
  apellido: string;
  tipo: TipoIdentificacion;
  numero: string;
}

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(leerToken());
  const usuario = ref<Usuario | null>(null);
  /**
   * Mensaje si no se pudo comprobar la sesión guardada por un fallo transitorio (red o
   * servidor caído). El token no se borra: el estudiante puede reintentar.
   */
  const errorSesion = ref<string | null>(null);

  const isAuthenticated = computed(() => usuario.value !== null);

  let restauracion: Promise<boolean> | null = null;

  /** Guarda al usuario y sincroniza el nivel con el contexto pedagógico. */
  function establecerUsuario(datos: Usuario): void {
    usuario.value = datos;
    errorSesion.value = null;
    useContextoStore().setNivel(datos.nivel);
  }

  function aplicarSesion(respuesta: TokenResponse): Usuario {
    token.value = respuesta.access_token;
    guardarToken(respuesta.access_token);
    establecerUsuario(respuesta.user);
    return respuesta.user;
  }

  /** Entra con una identificación existente. Lanza `ApiError` (404 `usuario_no_encontrado`...). */
  async function login(tipo: TipoIdentificacion, numero: string): Promise<Usuario> {
    const cuerpo: LoginPayload = {
      tipo_identificacion: tipo,
      numero_identificacion: normalizarNumero(numero),
    };
    const respuesta = await apiFetch<TokenResponse>('/auth/login', {
      method: 'POST',
      body: cuerpo,
      auth: false,
    });
    return aplicarSesion(respuesta);
  }

  /** Crea la cuenta y entra. Lanza `ApiError` (409 `usuario_existente`, 422...). */
  async function register(datos: DatosRegistro): Promise<Usuario> {
    const cuerpo: RegistroPayload = {
      nombre: datos.nombre,
      apellido: datos.apellido,
      tipo_identificacion: datos.tipo,
      numero_identificacion: normalizarNumero(datos.numero),
    };
    const respuesta = await apiFetch<TokenResponse>('/auth/register', {
      method: 'POST',
      body: cuerpo,
      auth: false,
    });
    return aplicarSesion(respuesta);
  }

  /** Cierra la sesión y limpia lo que pertenecía al estudiante (progreso y contexto). */
  function logout(): void {
    token.value = null;
    usuario.value = null;
    errorSesion.value = null;
    borrarToken();
    useProgresoStore().reset();
    useContextoStore().reset();
  }

  /**
   * Recupera al usuario de un token guardado (GET /api/me). Devuelve `true` si hay sesión.
   * - Token inválido o vencido (401): `apiFetch` ya cierra la sesión; devuelve `false`.
   * - Fallo transitorio (red, 5xx): devuelve `false` conservando el token y deja `errorSesion`.
   * Varias llamadas simultáneas comparten una sola petición.
   */
  function restore(): Promise<boolean> {
    if (usuario.value) return Promise.resolve(true);
    if (!token.value) return Promise.resolve(false);
    if (restauracion) return restauracion;

    const promesa = (async () => {
      try {
        establecerUsuario(await apiFetch<Usuario>('/me'));
        return true;
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) {
          // Ya se cerró la sesión dentro de apiFetch; por si acaso se deja consistente.
          logout();
        } else {
          errorSesion.value =
            'No pudimos comprobar tu sesión. Revisa tu conexión e ingresa de nuevo.';
        }
        return false;
      } finally {
        restauracion = null;
      }
    })();
    restauracion = promesa;
    return promesa;
  }

  /** Cambia el nivel (PATCH /api/me) y lo refleja en el contexto pedagógico. */
  async function actualizarNivel(nivel: Nivel): Promise<Usuario> {
    const actualizado = await apiFetch<Usuario>('/me', { method: 'PATCH', body: { nivel } });
    establecerUsuario(actualizado);
    return actualizado;
  }

  return {
    token,
    usuario,
    errorSesion,
    isAuthenticated,
    login,
    register,
    logout,
    restore,
    establecerUsuario,
    actualizarNivel,
  };
});
