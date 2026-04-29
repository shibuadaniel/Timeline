import Autocomplete from "@mui/material/Autocomplete";
import TextField from "@mui/material/TextField";

type LocationSelectFieldProps = {
  label: string;
  /** `"all"` or a specific location from `options`. */
  value: string;
  options: string[];
  onChange: (next: string) => void;
  disabled?: boolean;
};

export function LocationSelectField({
  label,
  value,
  options,
  onChange,
  disabled,
}: LocationSelectFieldProps) {
  const selected = value === "all" ? null : value;

  return (
    <Autocomplete
      disabled={disabled}
      options={options}
      value={selected}
      onChange={(_, next) => onChange(next ?? "all")}
      getOptionLabel={(o) => o}
      isOptionEqualToValue={(a, b) => a === b}
      renderInput={(params) => (
        <TextField {...params} label={label} placeholder="All" />
      )}
      sx={{ minWidth: 260 }}
    />
  );
}
