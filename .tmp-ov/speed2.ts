import { loadOverviewSeries } from '../src/utils/ownerOverview';
(async () => { const t = Date.now(); await loadOverviewSeries(); console.log('series ms', Date.now() - t); })();
