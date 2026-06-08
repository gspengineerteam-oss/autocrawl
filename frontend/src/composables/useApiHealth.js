import { useQuery } from '@tanstack/vue-query';
import { computed } from 'vue';
import { api } from '@/api/client';
export function useApiHealth() {
    const query = useQuery({
        queryKey: ['health'],
        queryFn: api.health,
        refetchInterval: 30000,
        retry: 1,
    });
    const status = computed(() => {
        if (query.isError.value)
            return 'down';
        if (!query.data.value)
            return 'unknown';
        return query.data.value.status === 'ok' ? 'ok' : 'degraded';
    });
    const dbStatus = computed(() => {
        if (!query.data.value)
            return 'unknown';
        return query.data.value.db === 'ok' ? 'ok' : 'down';
    });
    return { status, dbStatus, query };
}
