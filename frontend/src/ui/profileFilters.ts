export type ProfileFilterCategory = 'all' | 'numeric' | 'datetime';

export interface ProfileFilterCategoryBindingOptions {
    root: ParentNode;
    getFilterCategory: () => ProfileFilterCategory;
    onFilterCategoryChange: (category: ProfileFilterCategory) => void;
    signal?: AbortSignal;
}

/** Bind the shared All / Numeric / Datetime category behavior to any profile header. */
export function bindProfileFilterCategoryControls(options: ProfileFilterCategoryBindingOptions): void {
    const categoryButtons = Array.from(
        options.root.querySelectorAll<HTMLButtonElement>('.profile-filter-category-btn'),
    );
    const setActiveCategory = (category: ProfileFilterCategory) => {
        for (const button of categoryButtons) {
            const active = button.dataset.category === category;
            button.classList.toggle('is-active', active);
            button.setAttribute('aria-pressed', active ? 'true' : 'false');
        }
    };
    setActiveCategory(options.getFilterCategory());
    for (const button of categoryButtons) {
        button.addEventListener('click', () => {
            const category = (button.dataset.category || 'all') as ProfileFilterCategory;
            setActiveCategory(category);
            options.onFilterCategoryChange(category);
        }, options.signal ? { signal: options.signal } : undefined);
    }
}
