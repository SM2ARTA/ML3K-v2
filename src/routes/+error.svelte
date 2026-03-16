<script lang="ts">
	import { page } from '$app/state';
</script>

<div style="display:flex;align-items:center;justify-content:center;height:80vh;text-align:center">
	<div>
		<div style="font-size:48px;margin-bottom:12px">🏟️</div>
		<div style="font-size:24px;font-weight:700;margin-bottom:4px">{page.status}</div>
		<div style="font-size:14px;color:var(--ts);margin-bottom:20px">{page.error?.message || 'Page not found'}</div>
		<a href="/" class="mbtn mbtn-primary" style="text-decoration:none">Back to Dashboard</a>
	</div>
</div>
