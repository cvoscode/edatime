import { createStore } from 'solid-js/store';

export type CausalMethod = 'pcmci' | 'pcmciplus' | 'fullci' | 'bivci' | 'lpcmci';
export type CausalTest = 'par_corr' | 'robust_parcorr' | 'cmi_knn' | 'gsquared' | 'cmi_symb';
export type FdrMethod = 'none' | 'fdr_bh';

export interface CausalLink {
  source: string;
  target: string;
  lag: number;
  type: string;
  value: number;
  pvalue: number;
}

export interface CausalGraphResponse {
  columns: string[];
  tau_max: number;
  links: CausalLink[];
  graph: string[][][];
  val_matrix: number[][][];
  p_matrix: number[][][];
}

export interface SavedCausalRun {
  id: string;
  name: string;
  timestamp: number;
  params: CausalParams;
  links: CausalLink[];
}

export interface CausalParams {
  columns: string[];
  tauMax: number;
  alpha: number;
  pcAlpha: number;
  method: CausalMethod;
  test: CausalTest;
  fdrMethod: FdrMethod;
  maxCondsDim?: number;
}

interface CausalState {
  links: CausalLink[];
  graph: string[][][];
  valMatrix: number[][][];
  pMatrix: number[][][];
  selectedColumns: string[];
  method: CausalMethod;
  test: CausalTest;
  tauMax: number;
  alpha: number;
  pcAlpha: number;
  maxCondsDim: number | null;
  fdrMethod: FdrMethod;
  loading: boolean;
  error: string | null;
  savedRuns: SavedCausalRun[];
  compareRunA: string | null;
  compareRunB: string | null;
}

const defaultParams: CausalParams = {
  columns: [],
  tauMax: 3,
  alpha: 0.05,
  pcAlpha: 0.2,
  method: 'pcmci',
  test: 'par_corr',
  fdrMethod: 'none',
};

const [causalState, setCausalState] = createStore<CausalState>({
  links: [],
  graph: [],
  valMatrix: [],
  pMatrix: [],
  selectedColumns: [],
  method: 'pcmci',
  test: 'par_corr',
  tauMax: 3,
  alpha: 0.05,
  pcAlpha: 0.2,
  maxCondsDim: null,
  fdrMethod: 'none',
  loading: false,
  error: null,
  savedRuns: loadSavedRuns(),
  compareRunA: null,
  compareRunB: null,
});

const SAVED_RUNS_KEY = 'edatime_causal_runs';

function loadSavedRuns(): SavedCausalRun[] {
  try {
    const raw = localStorage.getItem(SAVED_RUNS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function persistSavedRuns(runs: SavedCausalRun[]) {
  localStorage.setItem(SAVED_RUNS_KEY, JSON.stringify(runs));
}

export const causalStore = {
  get state() { return causalState; },

  setLinks(links: CausalLink[]) {
    setCausalState('links', links);
  },

  setGraph(graph: string[][][]) {
    setCausalState('graph', graph);
  },

  setValMatrix(valMatrix: number[][][]) {
    setCausalState('valMatrix', valMatrix);
  },

  setPMatrix(pMatrix: number[][][]) {
    setCausalState('pMatrix', pMatrix);
  },

  setSelectedColumns(columns: string[]) {
    setCausalState('selectedColumns', columns);
  },

  setMethod(method: CausalMethod) {
    setCausalState('method', method);
  },

  setTest(test: CausalTest) {
    setCausalState('test', test);
  },

  setTauMax(tauMax: number) {
    setCausalState('tauMax', tauMax);
  },

  setAlpha(alpha: number) {
    setCausalState('alpha', alpha);
  },

  setPcAlpha(pcAlpha: number) {
    setCausalState('pcAlpha', pcAlpha);
  },

  setMaxCondsDim(dim: number | null) {
    setCausalState('maxCondsDim', dim);
  },

  setFdrMethod(fdrMethod: FdrMethod) {
    setCausalState('fdrMethod', fdrMethod);
  },

  setLoading(loading: boolean) {
    setCausalState('loading', loading);
  },

  setError(error: string | null) {
    setCausalState('error', error);
  },

  setGraphResult(result: CausalGraphResponse) {
    setCausalState({
      links: result.links,
      graph: result.graph,
      valMatrix: result.val_matrix,
      pMatrix: result.p_matrix,
    });
  },

  saveRun(name: string) {
    const run: SavedCausalRun = {
      id: crypto.randomUUID(),
      name,
      timestamp: Date.now(),
      params: {
        columns: [...causalState.selectedColumns],
        tauMax: causalState.tauMax,
        alpha: causalState.alpha,
        pcAlpha: causalState.pcAlpha,
        method: causalState.method,
        test: causalState.test,
        fdrMethod: causalState.fdrMethod,
        maxCondsDim: causalState.maxCondsDim ?? undefined,
      },
      links: [...causalState.links],
    };
    const updated = [run, ...causalState.savedRuns].slice(0, 20);
    setCausalState('savedRuns', updated);
    persistSavedRuns(updated);
  },

  deleteRun(id: string) {
    const updated = causalState.savedRuns.filter(r => r.id !== id);
    setCausalState('savedRuns', updated);
    persistSavedRuns(updated);
  },

  setCompareRunA(id: string | null) {
    setCausalState('compareRunA', id);
  },

  setCompareRunB(id: string | null) {
    setCausalState('compareRunB', id);
  },

  clearGraph() {
    setCausalState({
      links: [],
      graph: [],
      valMatrix: [],
      pMatrix: [],
      error: null,
    });
  },

  reset() {
    setCausalState({
      links: [],
      graph: [],
      valMatrix: [],
      pMatrix: [],
      selectedColumns: [],
      method: 'pcmci',
      test: 'par_corr',
      tauMax: 3,
      alpha: 0.05,
      pcAlpha: 0.2,
      maxCondsDim: null,
      fdrMethod: 'none',
      loading: false,
      error: null,
      savedRuns: [],
      compareRunA: null,
      compareRunB: null,
    });
  },
};