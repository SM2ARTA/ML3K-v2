<script lang="ts">
	import { goto } from '$app/navigation';
	import { FileUpload } from '$lib/components';
</script>

<div style="padding:20px">
	<FileUpload onComplete={() => goto('/lp')} />
</div>
