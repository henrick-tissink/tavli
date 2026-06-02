import { type Locale, DEFAULT_LOCALE, isLocale } from "./locale";

import roCommon from "@/messages/ro/common.json";
import enCommon from "@/messages/en/common.json";
import deCommon from "@/messages/de/common.json";

import roDiscovery from "@/messages/ro/discovery.json";
import enDiscovery from "@/messages/en/discovery.json";
import deDiscovery from "@/messages/de/discovery.json";

import roRestaurant from "@/messages/ro/restaurant.json";
import enRestaurant from "@/messages/en/restaurant.json";
import deRestaurant from "@/messages/de/restaurant.json";

import roMenu from "@/messages/ro/menu.json";
import enMenu from "@/messages/en/menu.json";
import deMenu from "@/messages/de/menu.json";

import roBooking from "@/messages/ro/booking.json";
import enBooking from "@/messages/en/booking.json";
import deBooking from "@/messages/de/booking.json";

import roReviews from "@/messages/ro/reviews.json";
import enReviews from "@/messages/en/reviews.json";
import deReviews from "@/messages/de/reviews.json";

import roEvents from "@/messages/ro/events.json";
import enEvents from "@/messages/en/events.json";
import deEvents from "@/messages/de/events.json";

import roProfile from "@/messages/ro/profile.json";
import enProfile from "@/messages/en/profile.json";
import deProfile from "@/messages/de/profile.json";

import roEmails from "@/messages/ro/emails.json";
import enEmails from "@/messages/en/emails.json";
import deEmails from "@/messages/de/emails.json";

/** Structural contract for the `common` namespace. */
export interface CommonMessages {
  languageName: string;
  switchLanguage: string;
  locales: Record<Locale, string>;
  cities: Record<string, string>;
}

/** Structural contract for the `discovery` namespace. */
export interface DiscoveryMessages {
  search: {
    placeholder: string;
    back: string;
    recentTitle: string;
    clearAll: string;
    trendingTitle: string;
    categoriesTitle: string;
    resultsRestaurants: string;
    resultsCuisines: string;
    noResults: string;
    cuisineCount: { one: string; few: string; other: string };
    trending: { bbq: string; rooftop: string; brunch: string; newOpenings: string };
    categories: {
      pizza: string; japanese: string; steak: string; vegan: string;
      coffee: string; cocktails: string; burgers: string; fish: string;
    };
  };
  filters: {
    all: string;
    openNow: string;
    privateEvent: string;
    cuisine: string;
    price: string;
    neighborhood: string;
    more: string;
    moreAriaLabel: string;
    title: string;
    reset: string;
    minRating: string;
    ratingAny: string;
    noResults: string;
    showResults: { one: string; few: string; other: string };
    priceAccessible: string;
    priceModerate: string;
    pricePremium: string;
    priceExclusive: string;
  };
  feed: {
    noMatchTitle: string;
    noMatchBody: string;
    resetFilters: string;
    trendingTitle: string;
    trendingSubtitle: string;
    availableTodayTitle: string;
    availableTodaySubtitle: string;
    newTitle: string;
    newSubtitle: string;
    weekRestaurant: string;
    availableToday: string;
    viewRestaurant: string;
  };
  map: {
    searchPlaceholder: string;
    filters: string;
    closeMap: string;
  };
  card: {
    saveAriaLabel: string;
    viewAriaLabel: string;
    privateEventBadge: string;
    reviews: { one: string; few: string; other: string };
    topDimension: string;
  };
  cover: {
    tagline: string;
    availableCount: { one: string; few: string; other: string };
    availableIntro: string;
    searchCta: string;
  };
  dietary: {
    vegan: string;
    vegetarian: string;
    glutenFree: string;
    spicy: string;
    clear: string;
  };
  tabs: {
    discover: string;
    map: string;
    search: string;
    saved: string;
    profile: string;
    navAriaLabel: string;
  };
  nav: {
    logoAriaLabel: string;
    searchPlaceholder: string;
    savedAriaLabel: string;
    profileAriaLabel: string;
  };
}

/** Structural contract for the `restaurant` namespace. */
export interface RestaurantMessages {
  notFound: { title: string; back: string };
  detail: {
    availableToday: string;
    noSlotsTitle: string;
    noSlotsBody: string;
    bookOtherDay: string;
    readMore: string;
    showLess: string;
    chefPicksTitle: string;
    chefPicksSubtitle: string;
    viewMenu: string;
    viewMenuLabel: string;
    viewMenuFull: string;
    pickBadge: string;
    viewMenuRecommendations: { one: string; few: string; other: string };
    reviewsTitle: string;
    reviewsSubtitle: string;
    scheduleTitle: string;
    scheduleSubtitle: string;
    locationTitle: string;
    locationSubtitle: string;
    directionsLink: string;
    nearbyTitle: string;
    nearbySubtitle: string;
    bookTable: string;
    stickyBookCta: string;
    stickyNextSlot: string;
  };
  gallery: { backAriaLabel: string; saveAriaLabel: string; shareAriaLabel: string };
  reviewCard: {
    bookedContext: string;
    guestOne: string;
    guestOther: string;
    helpful: string;
    restaurantReply: string;
  };
  reviewIntelligence: {
    title: string;
    basedOn: { one: string; few: string; other: string };
    topMentionsTitle: string;
    bestForTitle: string;
  };
  cuisineAdjectives: Record<string, string>;
}

/** Structural contract for the `menu` namespace. */
export interface MenuMessages {
  meta: {
    title: string;
  };
  viewer: {
    backAriaLabel: string;
    menuLabel: string;
    dishesCount: { one: string; few: string; other: string };
    priceRange: string;
    chefPicksTitle: string;
    chefPicksCount: { one: string; few: string; other: string };
    viewItem: string;
    noMatchBody: string;
    clearFilters: string;
  };
  itemCard: {
    chefPickAriaLabel: string;
    popularLabel: string;
    veganLabel: string;
    vegetarianLabel: string;
    glutenFreeLabel: string;
    spicyLabel: string;
  };
  itemSheet: {
    chefPickAriaLabel: string;
    popularLabel: string;
    veganLabel: string;
    vegetarianLabel: string;
    glutenFreeLabel: string;
    spicyLabel: string;
    chefNoteTitle: string;
    chefNoteBody: string;
    moreFromSection: string;
  };
  pageClient: {
    noMenuTitle: string;
    noMenuBody: string;
    backTo: string;
  };
}

/** Structural contract for the `booking` namespace. */
export interface BookingMessages {
  sheet: {
    headerLabel: string;
    progress: string;
    back: string;
    continue: string;
    submitting: string;
    submit: string;
    errorGeneric: string;
    errorName: string;
    errorPhone: string;
    errorEmail: string;
    stepDate: { title: string; today: string; tomorrow: string };
    stepParty: {
      title: string;
      decrementAriaLabel: string;
      incrementAriaLabel: string;
      privateEventHint: string;
      privateEventLink: string;
      hintDinner: string;
      hintLunch: string;
      hintFriends: string;
    };
    stepSlot: {
      title: string;
      subtitle: string;
      loadingAriaLabel: string;
      noSlots: string;
      noSlotsHint: string;
      zoneLabel: string;
      allZones: string;
    };
    stepIdentity: {
      title: string;
      nameLabel: string;
      phoneLabel: string;
      emailLabel: string;
      occasionLabel: string;
      occasionNone: string;
      occasionBirthday: string;
      occasionAnniversary: string;
      birthdayDateLabel: string;
      anniversaryDateLabel: string;
      notesLabel: string;
      summaryToday: string;
      summaryTomorrow: string;
      guests: { one: string; few: string; other: string };
    };
    stepSent: {
      title: string;
      subtitle: string;
      viewReservation: string;
      backToRestaurant: string;
    };
  };
  confirmed: {
    eyebrow: string;
    awaitingYou: string;
    forParty: string;
    waitingBadge: string;
    addressLabel: string;
    directionsLink: string;
    phoneLabel: string;
    calendarLabel: string;
    calendarDownload: string;
    calendarAriaLabel: string;
    needToCancel: string;
    cancelLink: string;
    partyUnit: { one: string; few: string; other: string };
    icsSummary: string;
  };
  cancel: {
    reasonLabel: string;
    reasonPlaceholder: string;
    submitPending: string;
    submitLabel: string;
    confirmDialog: string;
    doneTitle: string;
    doneBody: string;
    errorGeneric: string;
  };
  modify: {
    pageTitle: string;
    modifyingLabel: string;
    dateLabel: string;
    timeLabel: string;
    partySizeLabel: string;
    submitPending: string;
    submitLabel: string;
    doneTitle: string;
    doneBody: string;
    errorGeneric: string;
    windowClosedBody: string;
    callLink: string;
    emailLink: string;
    backLink: string;
    configMissing: string;
    notFound: string;
  };
  tokenPage: {
    reservationLabel: string;
    alreadyCancelledTitle: string;
    alreadyCancelledBody: string;
    completedTitle: string;
    completedBody: string;
    notFoundTitle: string;
    notFoundBody: string;
    configMissingTitle: string;
    configMissingBody: string;
    contactLabel: string;
  };
  errors: {
    modifyWindowClosed: string;
    modifyTerminal: string;
    modifySlotFull: string;
    modifyConflict: string;
    modifyFailed: string;
    configMissing: string;
    cancelFailed: string;
  };
}

/** Structural contract for the `reviews` namespace. */
export interface ReviewsMessages {
  page: {
    eyebrow: string;
    readyHeading: string;
    readyBody: string;
    alreadyReviewedTitle: string;
    alreadyReviewedBody: string;
    ineligibleTitle: string;
    ineligibleBody: string;
    notFoundTitle: string;
    notFoundBody: string;
    configMissingTitle: string;
    configMissingBody: string;
    contactLabel: string;
  };
  form: {
    ratingLegend: string;
    commentLabel: string;
    commentOptional: string;
    commentPlaceholder: string;
    aggregateLabel: string;
    submitPending: string;
    submitLabel: string;
    errorNoRating: string;
    errorGeneric: string;
    doneTitle: string;
    doneBody: string;
  };
  errors: {
    rateLimited: string;
    visitNotYet: string;
    windowExpired: string;
    editWindowExpired: string;
    editHidden: string;
    editFailed: string;
  };
}

/** Structural contract for the `events` namespace. */
export interface EventsMessages {
  meta: {
    title: string;
    description: string;
  };
  cta: {
    organise: string;
    organisePrivate: string;
    organiseSubtitle: string;
  };
  sheet: {
    titleSuffix: string;
    closeAriaLabel: string;
    occasion: {
      heading: string;
      labels: Record<string, string>;
    };
    date: { label: string; timePrefLabel: string; timePrefPlaceholder: string };
    details: {
      persoanelLabel: string;
      spaceLabel: string;
      budgetLabel: string;
      menuLabel: string;
      dietaryLabel: string;
      notesLabel: string;
    };
    identity: {
      nameLabel: string;
      emailLabel: string;
      phoneLabel: string;
      companyCheckLabel: string;
      cuiLabel: string;
      companyNameLabel: string;
    };
    continue: string;
    back: string;
    submitPending: string;
    submitLabel: string;
    errorGeneric: string;
  };
  sheetV2: {
    titleSuffix: string;
    closeAriaLabel: string;
    dialogAriaLabel: string;
    progress: { stepLabel: string };
    stepOccasion: {
      heading: string;
      subheading: string;
      occasions: Record<string, { label: string; blurb: string }>;
      continue: string;
    };
    stepDate: {
      heading: string;
      leadTimeNotice: string;
      timePrefLabel: string;
      timePrefPlaceholder: string;
      back: string;
      continue: string;
    };
    stepDetails: {
      heading: string;
      partySizeLabel: string;
      spaceLabel: string;
      spaceFreeLabel: string;
      budgetLabel: string;
      menuSectionLabel: string;
      menuPlaceholder: string;
      dietaryPlaceholder: string;
      notesPlaceholder: string;
      back: string;
      continue: string;
    };
    stepIdentity: {
      heading: string;
      nameLabel: string;
      emailLabel: string;
      phoneLabel: string;
      companyCheckLabel: string;
      confirmationNotice: string;
      errorNoOccasion: string;
      back: string;
      submitPending: string;
      submitLabel: string;
    };
    stepSent: {
      heading: string;
      body: string;
      spamNotice: string;
    };
  };
  landing: {
    hero: {
      eyebrow: string;
      heading: string;
      body: string;
      venueCount: { one: string; few: string; other: string };
    };
    occasionGrid: {
      heading: string;
      occasions: Record<string, { label: string; blurb: string }>;
    };
    allVenuesHeading: string;
  };
  tracking: {
    requestLabel: string;
    partySizeUnit: string;
    partnerResponseLabel: string;
    quoteLabel: string;
    quoteCurrency: string;
    acceptQuote: string;
    declineQuote: string;
    declineReasonPrefix: string;
    cancelRequest: string;
    status: Record<string, string>;
  };
}

/** Structural contract for the `profile` namespace. */
export interface ProfileMessages {
  screen: {
    defaultDisplayName: string;
    memberSince: string;
    settingsTitle: string;
    cityLabel: string;
    notificationsLabel: string;
    notificationsAriaLabel: string;
    legalTitle: string;
    legalPrivacy: string;
    legalTerms: string;
    legalCookies: string;
    legalAnpc: string;
    legalContact: string;
    signOut: string;
    signedOutTitle: string;
    signedOutBody: string;
    signIn: string;
  };
  saved: {
    savedTitle: string;
    emptyTitle: string;
    emptyBody: string;
    discoverAction: string;
    bookingsTitle: string;
    bookingsEmptyTitle: string;
    bookingsEmptyBody: string;
    bookingAt: string;
    bookingGuests: { one: string; few: string; other: string };
  };
  auth: {
    signInTitle: string;
    signUpTitle: string;
    signInSubmit: string;
    signUpSubmit: string;
    signInLoading: string;
    signUpLoading: string;
    emailPlaceholder: string;
    emailAriaLabel: string;
    passwordPlaceholder: string;
    passwordAriaLabel: string;
    signInSubtitle: string;
    signUpSubtitle: string;
    confirmationTitle: string;
    confirmationBody: string;
    confirmationAck: string;
    switchToSignUp: string;
    switchToSignIn: string;
    legalPrefix: string;
    legalTerms: string;
    legalAnd: string;
    legalPrivacy: string;
  };
  citySelector: {
    ariaLabel: string;
    comingSoon: string;
  };
  empty: Record<string, never>;
}

/** Plural-bag type used across the emails catalogue. */
type PluralBag = { one: string; few: string; other: string };

/** Structural contract for the `emails` namespace. */
export interface EmailsMessages {
  confirmation: {
    subject: string;
    preview: string;
    heading: string;
    lede: string;
    guests: PluralBag;
    reminderText: string;
    cancelButton: string;
    footer: string;
  };
  reminder: {
    subject: string;
    preview: string;
    heading: string;
    lede: string;
    guests: PluralBag;
    cancelHint: string;
    manageButton: string;
    footer: string;
  };
  postVisit: {
    subject: string;
    preview: string;
    heading: string;
    lede: string;
    instructionText: string;
    footer: string;
  };
  partnerAlert: {
    subject: string;
    preview: string;
    heading: string;
    covers: PluralBag;
    zoneLabel: string;
    notesLabel: string;
    manageText: string;
    footer: string;
  };
  partnerCancelled: {
    subject: string;
    preview: string;
    heading: string;
    lede: string;
    guests: PluralBag;
    apologyText: string;
    rebookButton: string;
    footer: string;
  };
}

/**
 * Registry of namespaces. Each entry is Record<Locale, NsMessages>, so a missing
 * key in any locale is a TypeScript error at build time (the locked completeness
 * contract). Add new namespaces here as later phases extract strings.
 */
const CATALOGS = {
  common: { ro: roCommon, en: enCommon, de: deCommon } as Record<
    Locale,
    CommonMessages
  >,
  discovery: { ro: roDiscovery, en: enDiscovery, de: deDiscovery } as Record<
    Locale,
    DiscoveryMessages
  >,
  restaurant: { ro: roRestaurant, en: enRestaurant, de: deRestaurant } as Record<
    Locale,
    RestaurantMessages
  >,
  menu: { ro: roMenu, en: enMenu, de: deMenu } as Record<
    Locale,
    MenuMessages
  >,
  booking: { ro: roBooking, en: enBooking, de: deBooking } as Record<
    Locale,
    BookingMessages
  >,
  reviews: { ro: roReviews, en: enReviews, de: deReviews } as Record<
    Locale,
    ReviewsMessages
  >,
  events: { ro: roEvents, en: enEvents, de: deEvents } as Record<
    Locale,
    EventsMessages
  >,
  profile: { ro: roProfile, en: enProfile, de: deProfile } as Record<
    Locale,
    ProfileMessages
  >,
  emails: { ro: roEmails, en: enEmails, de: deEmails } as Record<
    Locale,
    EmailsMessages
  >,
} as const;

export type Namespace = keyof typeof CATALOGS;
export const NAMESPACES = Object.keys(CATALOGS) as Namespace[];

type NsMessages<N extends Namespace> = (typeof CATALOGS)[N][Locale];

/** Server-side: return the typed namespace object for `locale` (RO fallback). */
export function getMessages<N extends Namespace>(
  locale: string,
  ns: N,
): NsMessages<N> {
  const l: Locale = isLocale(locale) ? locale : DEFAULT_LOCALE;
  return CATALOGS[ns][l];
}

/** Assemble a client-provider bundle for the given namespaces. */
export function buildBundle(
  locale: string,
  namespaces: Namespace[],
): Record<string, Record<string, unknown>> {
  const bundle: Record<string, Record<string, unknown>> = {};
  for (const ns of namespaces)
    bundle[ns] = getMessages(locale, ns) as unknown as Record<string, unknown>;
  return bundle;
}
