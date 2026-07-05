// `gh:OWNER/REPO/PATH` shorthand for the pandas raw CSV — the playground's
// CSV-URL loader expands it to https://raw.githubusercontent.com/.../HEAD/...
// just like the CLI's `--extensional` does.
export const TITANIC_CSV_URL = "gh:pandas-dev/pandas/doc/data/titanic.csv";

export const titanicExample = {
  name: "Titanic",
  description: "Survival summaries over the pandas Titanic CSV, loaded from GitHub raw",
  source: `# Titanic survival summaries.
#
# The passenger table is loaded from pandas' CORS-enabled raw GitHub CSV
# via the gh: shorthand (gh:pandas-dev/pandas/doc/data/titanic.csv).

extensional passenger(
    PassengerId: integer,
    Survived: integer,
    Pclass: integer,
    Name: string,
    Sex: string,
    Age: float?,
    SibSp: integer,
    Parch: integer,
    Ticket: string,
    Fare: float,
    Cabin: string?,
    Embarked: string?
).

survival_by_sex(Sex, avg(Survived), count(*)) :-
    passenger(_, Survived, _, _, Sex, _, _, _, _, _, _, _).

survival_by_class(Class, avg(Survived), count(*)) :-
    passenger(_, Survived, Class, _, _, _, _, _, _, _, _, _).

fare_by_class(Class, avg(Fare)) :-
    passenger(_, _, Class, _, _, _, _, _, _, Fare, _, _).

known_age_by_survival(Survived, avg(Age), count(Age)) :-
    passenger(_, Survived, _, _, _, Age, _, _, _, _, _, _).

?- survival_by_sex(Sex, Rate, N).
?- survival_by_class(Class, Rate, N).
?- fare_by_class(Class, AverageFare).
?- known_age_by_survival(Survived, AverageAge, KnownAgeCount).
`,
  csvUrlData: {
    passenger: TITANIC_CSV_URL,
  },
};
