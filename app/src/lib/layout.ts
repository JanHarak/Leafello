import { createContext, useContext } from 'react';

/**
 * O kolik px posunout centrovaný blok sekce doleva, aby na webu seděl na
 * skutečném středu viewportu (kam míří i titulek v hlavičce), a ne jen na
 * středu plochy napravo od levého menu. Hodnotu poskytuje Shell (`_layout`);
 * sekce si ji přidají na svůj centrovaný kontejner (capped sekce jako
 * `marginRight`, full-width sekce jako `paddingRight`). ScrollView zůstává přes
 * celou šířku, takže scrollbar drží u kraje – posune se jen blok uvnitř.
 */
export const ContentShiftContext = createContext(0);
export const useContentShift = () => useContext(ContentShiftContext);
